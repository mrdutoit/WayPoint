import { ValidationError } from './errors.js';
import { computeCycleEndDate } from './dateMath.js';

/**
 * Cycles (FR-014, reworked): a TenantAdmin-defined review period with a
 * start date and a Cadence — end_date is computed server-side
 * (dateMath.js), never typed by hand. "Active" is no longer a manually
 * toggled flag; it's computed from today's date falling within
 * [start_date, end_date] — see getCyclesForTenant's computed `status`
 * and objectiveService.js's resolveActiveCycle, which does the same
 * comparison to pick the Cycle new Objectives are created in.
 *
 * No two Cycles in a tenant may cover the same day — enforced at the
 * database layer via an EXCLUDE constraint (db/04-cadence-and-cycle-
 * rework.sql), not just here, so it holds even against a concurrent
 * create. That's what makes "the active Cycle" (singular) a safe thing
 * to depend on without an explicit is_active column.
 */

export async function getCyclesForTenant(client, tenantId) {
  const { rows } = await client.query(
    `SELECT c.id, c.name, c.cadence_id AS "cadenceId", cd.label AS "cadenceLabel",
            c.start_date AS "startDate", c.end_date AS "endDate", c.created_at AS "createdAt",
            CASE
              WHEN CURRENT_DATE < c.start_date THEN 'Upcoming'
              WHEN CURRENT_DATE > c.end_date THEN 'Past'
              ELSE 'Active'
            END AS status
     FROM okr.cycle c
     JOIN okr.cadence cd ON cd.id = c.cadence_id
     WHERE c.tenant_id = $1
     ORDER BY c.start_date DESC`,
    [tenantId]
  );
  return rows;
}

export class OverlappingCycleError extends Error {
  constructor() {
    super('This date range overlaps with an existing Cycle — no two Cycles in a tenant may cover the same day.');
    this.name = 'OverlappingCycleError';
  }
}

/**
 * end_date is always computed from startDate + the Cadence's months
 * (dateMath.js) — never accepted from the caller. Throws
 * OverlappingCycleError (mapped from the database's exclusion-constraint
 * violation, Postgres error code 23P01) if the computed range collides
 * with an existing Cycle.
 */
export async function createCycle(client, tenantId, { name, cadenceId, startDate }) {
  if (!name?.trim()) throw new ValidationError('name is required');
  if (!cadenceId) throw new ValidationError('cadenceId is required');
  if (!startDate) throw new ValidationError('startDate is required');

  const { rows: cadenceRows } = await client.query(
    `SELECT months FROM okr.cadence WHERE tenant_id = $1 AND id = $2`,
    [tenantId, cadenceId]
  );
  if (cadenceRows.length === 0) throw new ValidationError('cadenceId does not exist in this tenant');
  const endDate = computeCycleEndDate(startDate, cadenceRows[0].months);

  try {
    const { rows } = await client.query(
      `INSERT INTO okr.cycle (id, tenant_id, name, cadence_id, start_date, end_date)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       RETURNING id, name, cadence_id AS "cadenceId", start_date AS "startDate", end_date AS "endDate", created_at AS "createdAt"`,
      [tenantId, name.trim(), cadenceId, startDate, endDate]
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23P01') throw new OverlappingCycleError();
    throw err;
  }
}
