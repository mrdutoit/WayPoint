import { ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import { isElementEnabled } from './okrElementConfigService.js';
import { fetchKeyResultWithObjectiveOwner, assertCanEditObjective } from './keyResultService.js';
import { recomputeKeyResultStatus, recomputeObjectiveStatus } from './scoringService.js';

/**
 * Check-ins — FR-018 (submission), FR-019 (the score/status roll-up
 * this triggers), FR-010 (tenant_id on every table).
 *
 * confidence is a 1-5 integer — see db/migrations/07's module comment
 * for why that scale was chosen (FR-018 doesn't pin an exact range).
 */

const CHECK_IN_FIELDS = `
  ci.id, ci.tenant_id AS "tenantId", ci.key_result_id AS "keyResultId",
  ci.submitted_by_id AS "submittedById", ci.rubric_level_id AS "rubricLevelId",
  ci.confidence, ci.comment, ci.submitted_at AS "submittedAt"
`;

/**
 * Check-in comments/confidence stay restricted to owner, owner's
 * Manager, and TenantAdmin — matching the Stage 2 API table's original
 * audience for this endpoint, deliberately NOT widened alongside
 * Objective/Key Result visibility (see objectiveService.js's module
 * comment). This is where genuinely sensitive personal commentary
 * lives, not the OKR structure itself.
 *
 * This check did not exist before this round at all — listing was only
 * ever indirectly "protected" by the fact its parent Key Result wasn't
 * reachable under the old, narrower FR-020 rule. Broadening Key Result
 * visibility without adding this explicit check here would have leaked
 * Check-in comments to the entire tenant as an unintended side effect.
 */
export async function listCheckInsForKeyResult(client, tenantId, caller, keyResultId) {
  const keyResult = await fetchKeyResultWithObjectiveOwner(client, tenantId, keyResultId);
  if (!keyResult) throw new NotFoundError('Key Result not found');
  const allowed = caller.role === 'TenantAdmin' || keyResult.ownerId === caller.id || keyResult.ownerManagerId === caller.id;
  if (!allowed) throw new ForbiddenError('Only the Key Result owner, their Manager, or a Tenant Administrator can view Check-ins');

  const { rows } = await client.query(
    `SELECT ${CHECK_IN_FIELDS} FROM okr.check_in ci
     WHERE ci.tenant_id = $1 AND ci.key_result_id = $2
     ORDER BY ci.submitted_at DESC`,
    [tenantId, keyResultId]
  );
  return rows;
}

/**
 * Submits a Check-in, then recomputes and persists the Key Result's
 * status (score of this, now the most recent, Check-in) and cascades
 * that up through the Objective roll-up (scoringService.js) — all in
 * this same transaction, so a Check-in is never visible without the
 * status changes it causes also being visible.
 */
export async function createCheckIn(client, tenantId, caller, keyResultId, { rubricLevelId, confidence, comment }) {
  if (!(await isElementEnabled(client, tenantId, 'CheckIn'))) {
    throw new ValidationError('Check-ins are disabled for this tenant (FR-025) — enable them under OKR Settings first');
  }

  const keyResult = await fetchKeyResultWithObjectiveOwner(client, tenantId, keyResultId);
  if (!keyResult) throw new NotFoundError('Key Result not found');
  assertCanEditObjective(keyResult, caller);

  if (!rubricLevelId) throw new ValidationError('rubricLevelId is required');
  const { rows: levelRows } = await client.query(
    `SELECT rl.id FROM okr.rubric_level rl WHERE rl.rubric_id = $1 AND rl.id = $2`,
    [keyResult.rubricId, rubricLevelId]
  );
  if (levelRows.length === 0) throw new ValidationError('rubricLevelId does not belong to this tenant\'s rubric');

  const confidenceNum = Number(confidence);
  if (!Number.isInteger(confidenceNum) || confidenceNum < 1 || confidenceNum > 5) {
    throw new ValidationError('confidence must be an integer from 1 to 5');
  }

  const { rows } = await client.query(
    `INSERT INTO okr.check_in AS ci (id, tenant_id, key_result_id, submitted_by_id, rubric_level_id, confidence, comment)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
     RETURNING ${CHECK_IN_FIELDS}`,
    [tenantId, keyResultId, caller.id, rubricLevelId, confidenceNum, comment?.trim() || null]
  );
  const checkIn = rows[0];

  await recomputeKeyResultStatus(client, tenantId, keyResultId);
  await recomputeObjectiveStatus(client, tenantId, keyResult.objectiveId);

  return checkIn;
}
