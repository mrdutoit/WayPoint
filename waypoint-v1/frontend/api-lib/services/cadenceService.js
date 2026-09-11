import { ValidationError } from './errors.js';

/**
 * Cadence — a tenant-configurable set of options (Monthly/Quarterly/
 * Bi-Annually/Annually seeded as defaults on tenant creation — see
 * tenantService.js) that a Cycle's cadence_id points at. `months` drives
 * the server-computed end_date (dateMath.js) when a Cycle is created.
 *
 * Once at least one Cycle uses a Cadence, it's locked — CadenceInUseError
 * on any PATCH or DELETE. This was an open design question Mark asked to
 * be "figured out" rather than left as a gap: the simplest rule that
 * can't produce a surprise is "create a new Cadence instead of editing
 * one in use" — a locked Cadence still shows correctly on every Cycle
 * that already used it (end_date was computed once, at creation, and
 * stored on the Cycle row — it was never live-linked to the Cadence), so
 * nothing about existing data is actually at risk from editing months
 * after the fact. The lock exists for a softer reason: to stop
 * "Quarterly" quietly meaning something different for cycles created
 * before an edit than the ones created after it, not to protect data
 * integrity that isn't actually threatened. Renaming the label alone
 * would be safe to allow even once in use for the same reason (no
 * stored computation depends on the label) — locked anyway, for one
 * simple rule instead of two — flagged in case that nuance matters
 * enough in practice to split it out later.
 */

export class CadenceInUseError extends Error {
  constructor() {
    super('This Cadence is used by at least one Cycle and can no longer be edited or deleted — create a new Cadence instead.');
    this.name = 'CadenceInUseError';
  }
}

export const DEFAULT_CADENCES = [
  { label: 'Monthly', months: 1 },
  { label: 'Quarterly', months: 3 },
  { label: 'Bi-Annually', months: 6 },
  { label: 'Annually', months: 12 },
];

export async function listCadencesForTenant(client, tenantId) {
  const { rows } = await client.query(
    `SELECT id, label, months FROM okr.cadence WHERE tenant_id = $1 ORDER BY months ASC`,
    [tenantId]
  );
  return rows;
}

export async function createCadence(client, tenantId, { label, months }) {
  if (!label?.trim()) throw new ValidationError('label is required');
  if (!Number.isInteger(months) || months <= 0) throw new ValidationError('months must be a positive whole number');

  const { rows } = await client.query(
    `INSERT INTO okr.cadence (id, tenant_id, label, months)
     VALUES (gen_random_uuid(), $1, $2, $3)
     RETURNING id, label, months`,
    [tenantId, label.trim(), months]
  );
  return rows[0];
}

async function assertCadenceNotInUse(client, tenantId, cadenceId) {
  const { rows } = await client.query(
    `SELECT 1 FROM okr.cycle WHERE tenant_id = $1 AND cadence_id = $2 LIMIT 1`,
    [tenantId, cadenceId]
  );
  if (rows.length > 0) throw new CadenceInUseError();
}

export async function updateCadence(client, tenantId, cadenceId, { label, months }) {
  await assertCadenceNotInUse(client, tenantId, cadenceId);
  if (!label?.trim()) throw new ValidationError('label is required');
  if (!Number.isInteger(months) || months <= 0) throw new ValidationError('months must be a positive whole number');

  const { rows } = await client.query(
    `UPDATE okr.cadence SET label = $3, months = $4
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, label, months`,
    [tenantId, cadenceId, label.trim(), months]
  );
  if (rows.length === 0) throw new ValidationError('Cadence not found');
  return rows[0];
}

export async function deleteCadence(client, tenantId, cadenceId) {
  await assertCadenceNotInUse(client, tenantId, cadenceId);
  await client.query(`DELETE FROM okr.cadence WHERE tenant_id = $1 AND id = $2`, [tenantId, cadenceId]);
}
