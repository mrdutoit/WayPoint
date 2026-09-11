import { ForbiddenError, NotFoundError, ValidationError } from './errors.js';

/**
 * Key Results — FR-004 (status never client-writable), FR-016 (belongs
 * to exactly one Objective, free-form weighting normalised at roll-up
 * time, not enforced to sum to a total), FR-024 ("Not Started" default —
 * the only possible status until Check-in ships in Module 3, since
 * FR-019 computes Key Result status only from Check-in submissions and
 * none can exist yet).
 */

const KEY_RESULT_FIELDS = `
  kr.id, kr.tenant_id AS "tenantId", kr.objective_id AS "objectiveId",
  kr.rubric_id AS "rubricId", kr.title, kr.weighting, kr.status, kr.created_at AS "createdAt"
`;

export async function listKeyResultsForObjective(client, tenantId, objectiveId) {
  const { rows } = await client.query(
    `SELECT ${KEY_RESULT_FIELDS} FROM okr.key_result kr
     WHERE kr.tenant_id = $1 AND kr.objective_id = $2
     ORDER BY kr.created_at ASC`,
    [tenantId, objectiveId]
  );
  return rows;
}

async function fetchObjectiveWithOwner(client, tenantId, objectiveId) {
  const { rows } = await client.query(
    `SELECT o.id, o.owner_id AS "ownerId", owner.manager_id AS "ownerManagerId"
     FROM okr.objective o
     JOIN okr.user_account owner ON owner.id = o.owner_id
     WHERE o.tenant_id = $1 AND o.id = $2`,
    [tenantId, objectiveId]
  );
  return rows[0] ?? null;
}

function assertCanEditObjective(objectiveRow, caller) {
  const allowed = objectiveRow.ownerId === caller.id || objectiveRow.ownerManagerId === caller.id;
  if (!allowed) throw new ForbiddenError('Only the Objective owner or their Manager can do this');
}

export async function createKeyResult(client, tenantId, caller, objectiveId, { title, weighting, rubricId }) {
  const objective = await fetchObjectiveWithOwner(client, tenantId, objectiveId);
  if (!objective) throw new NotFoundError('Objective not found');
  assertCanEditObjective(objective, caller);

  if (!title?.trim()) throw new ValidationError('title is required');
  const resolvedWeighting = weighting ?? 1;
  if (typeof resolvedWeighting !== 'number' || resolvedWeighting <= 0) {
    throw new ValidationError('weighting must be a positive number');
  }

  let resolvedRubricId = rubricId ?? null;
  if (!resolvedRubricId) {
    const { rows } = await client.query(
      `SELECT id FROM okr.scoring_rubric WHERE tenant_id = $1 ORDER BY id LIMIT 1`,
      [tenantId]
    );
    if (rows.length === 0) {
      throw new ValidationError('No Scoring Rubric configured for this tenant yet (FR-017) — configure one before adding Key Results');
    }
    resolvedRubricId = rows[0].id;
  }

  const { rows } = await client.query(
    `INSERT INTO okr.key_result (id, tenant_id, objective_id, rubric_id, title, weighting, status)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'Not Started')
     RETURNING ${KEY_RESULT_FIELDS}`,
    [tenantId, objectiveId, resolvedRubricId, title.trim(), resolvedWeighting]
  );
  return rows[0];
}

/**
 * `status` is deliberately not an accepted field here — see FR-004.
 */
export async function updateKeyResult(client, tenantId, caller, keyResultId, { title, weighting }) {
  const { rows: existingRows } = await client.query(
    `SELECT kr.id, kr.objective_id AS "objectiveId", kr.title, kr.weighting
     FROM okr.key_result kr WHERE kr.tenant_id = $1 AND kr.id = $2`,
    [tenantId, keyResultId]
  );
  const existing = existingRows[0];
  if (!existing) throw new NotFoundError('Key Result not found');

  const objective = await fetchObjectiveWithOwner(client, tenantId, existing.objectiveId);
  assertCanEditObjective(objective, caller);

  const nextTitle = title !== undefined ? title : existing.title;
  if (!nextTitle?.trim()) throw new ValidationError('title cannot be empty');
  const nextWeighting = weighting !== undefined ? weighting : Number(existing.weighting);
  if (typeof nextWeighting !== 'number' || nextWeighting <= 0) {
    throw new ValidationError('weighting must be a positive number');
  }

  const { rows } = await client.query(
    `UPDATE okr.key_result SET title = $3, weighting = $4
     WHERE tenant_id = $1 AND id = $2
     RETURNING ${KEY_RESULT_FIELDS}`,
    [tenantId, keyResultId, nextTitle.trim(), nextWeighting]
  );
  return rows[0];
}

/**
 * FR-024 (Key Result half): "A Key Result with no Check-ins defaults to
 * a 'Not Started' status." Until Module 3 (Check-ins) ships, this is the
 * only status a Key Result can ever have — see the module note in
 * objectiveService.js's computeObjectiveStatus.
 */
export function computeKeyResultStatus(checkIns) {
  if (checkIns.length === 0) return 'Not Started';
  throw new Error('Score-from-latest-Check-in ships with Module 3 (Check-ins)');
}
