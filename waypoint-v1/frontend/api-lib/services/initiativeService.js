import { NotFoundError, ValidationError } from './errors.js';
import { isElementEnabled } from './okrElementConfigService.js';
import { fetchKeyResultWithObjectiveOwner, assertCanEditObjective } from './keyResultService.js';

/**
 * Initiatives — FR-026: "a title, status (Not Started, In Progress,
 * Done), an owner, and an optional due date." Unlike Objective/KeyResult,
 * Initiative's status is NOT server-computed (no FR-004 equivalent for
 * it) — the owner/Manager sets it directly, since it's tracking real
 * execution of concrete work, not a rubric score rolled up from
 * anything.
 */

const INITIATIVE_FIELDS = `
  i.id, i.tenant_id AS "tenantId", i.key_result_id AS "keyResultId",
  i.owner_id AS "ownerId", i.title, i.status, i.due_date AS "dueDate", i.created_at AS "createdAt"
`;

const VALID_STATUSES = ['Not Started', 'In Progress', 'Done'];

export async function listInitiativesForKeyResult(client, tenantId, keyResultId) {
  const { rows } = await client.query(
    `SELECT ${INITIATIVE_FIELDS} FROM okr.initiative i
     WHERE i.tenant_id = $1 AND i.key_result_id = $2
     ORDER BY i.created_at ASC`,
    [tenantId, keyResultId]
  );
  return rows;
}

export async function createInitiative(client, tenantId, caller, keyResultId, { title, ownerId, dueDate }) {
  if (!(await isElementEnabled(client, tenantId, 'Initiative'))) {
    throw new ValidationError('Initiatives are disabled for this tenant (FR-025) — enable them under OKR Settings first');
  }

  const keyResult = await fetchKeyResultWithObjectiveOwner(client, tenantId, keyResultId);
  if (!keyResult) throw new NotFoundError('Key Result not found');
  assertCanEditObjective(keyResult, caller);

  if (!title?.trim()) throw new ValidationError('title is required');

  // Defaults to the caller — an owner/Manager creating an Initiative for
  // themselves is the common case; an explicit ownerId (e.g. a Manager
  // assigning it to their report) is validated against the tenant.
  let resolvedOwnerId = caller.id;
  if (ownerId && ownerId !== caller.id) {
    const { rows } = await client.query(
      `SELECT id FROM okr.user_account WHERE tenant_id = $1 AND id = $2`,
      [tenantId, ownerId]
    );
    if (rows.length === 0) throw new ValidationError('ownerId does not exist in this tenant');
    resolvedOwnerId = ownerId;
  }

  if (dueDate !== undefined && dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new ValidationError('dueDate must be an ISO date string (YYYY-MM-DD)');
  }

  const { rows } = await client.query(
    `INSERT INTO okr.initiative AS i (id, tenant_id, key_result_id, owner_id, title, status, due_date)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'Not Started', $5)
     RETURNING ${INITIATIVE_FIELDS}`,
    [tenantId, keyResultId, resolvedOwnerId, title.trim(), dueDate ?? null]
  );
  return rows[0];
}

export async function updateInitiative(client, tenantId, caller, initiativeId, { title, status, dueDate }) {
  const { rows: existingRows } = await client.query(
    `SELECT i.id, i.key_result_id AS "keyResultId", i.title, i.status, i.due_date AS "dueDate"
     FROM okr.initiative i WHERE i.tenant_id = $1 AND i.id = $2`,
    [tenantId, initiativeId]
  );
  const existing = existingRows[0];
  if (!existing) throw new NotFoundError('Initiative not found');

  const keyResult = await fetchKeyResultWithObjectiveOwner(client, tenantId, existing.keyResultId);
  assertCanEditObjective(keyResult, caller);

  const nextTitle = title !== undefined ? title : existing.title;
  if (!nextTitle?.trim()) throw new ValidationError('title cannot be empty');

  const nextStatus = status !== undefined ? status : existing.status;
  if (!VALID_STATUSES.includes(nextStatus)) {
    throw new ValidationError(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  let nextDueDate = dueDate !== undefined ? dueDate : existing.dueDate;
  if (typeof nextDueDate === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) {
    throw new ValidationError('dueDate must be an ISO date string (YYYY-MM-DD)');
  }

  const { rows } = await client.query(
    `UPDATE okr.initiative AS i SET title = $3, status = $4, due_date = $5
     WHERE tenant_id = $1 AND id = $2
     RETURNING ${INITIATIVE_FIELDS}`,
    [tenantId, initiativeId, nextTitle.trim(), nextStatus, nextDueDate ?? null]
  );
  return rows[0];
}
