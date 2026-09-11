import { ValidationError } from './errors.js';

/**
 * Cycles (FR-014): a TenantAdmin-defined review period with a start date,
 * end date, and cadence label. Only one Cycle may be marked active per
 * tenant at a time — enforced both at the database layer (see the
 * partial unique index in db/02-okr-core.sql) and here.
 */

export async function getCyclesForTenant(client, tenantId) {
  const { rows } = await client.query(
    `SELECT id, name, cadence, start_date, end_date, is_active, created_at
     FROM okr.cycle
     WHERE tenant_id = $1
     ORDER BY start_date DESC`,
    [tenantId]
  );
  return rows;
}

export async function createCycle(client, tenantId, { name, cadence, startDate, endDate }) {
  if (!name?.trim()) throw new ValidationError('name is required');
  if (!cadence?.trim()) throw new ValidationError('cadence is required');
  if (!startDate || !endDate) throw new ValidationError('startDate and endDate are required');
  if (new Date(endDate) <= new Date(startDate)) throw new ValidationError('endDate must be after startDate');

  const { rows } = await client.query(
    `INSERT INTO okr.cycle (id, tenant_id, name, cadence, start_date, end_date, is_active)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, false)
     RETURNING id, name, cadence, start_date, end_date, is_active, created_at`,
    [tenantId, name.trim(), cadence.trim(), startDate, endDate]
  );
  return rows[0];
}

export class CycleNotFoundError extends Error {
  constructor() {
    super('Cycle not found');
    this.name = 'CycleNotFoundError';
  }
}

/**
 * Activates `cycleId` and deactivates whatever was previously active for
 * this tenant, as two statements in the same transaction rather than one
 * UPDATE that flips both — safer than relying on same-statement unique
 * index check ordering across multiple rows.
 */
export async function activateCycle(client, tenantId, cycleId) {
  const { rows: target } = await client.query(
    `SELECT id FROM okr.cycle WHERE tenant_id = $1 AND id = $2`,
    [tenantId, cycleId]
  );
  if (target.length === 0) throw new CycleNotFoundError();

  await client.query(
    `UPDATE okr.cycle SET is_active = false WHERE tenant_id = $1 AND is_active = true`,
    [tenantId]
  );
  const { rows } = await client.query(
    `UPDATE okr.cycle SET is_active = true WHERE tenant_id = $1 AND id = $2
     RETURNING id, name, cadence, start_date, end_date, is_active, created_at`,
    [tenantId, cycleId]
  );
  return rows[0];
}
