import { ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import { isElementEnabled } from './okrElementConfigService.js';
import { fetchObjectiveWithOwner, assertCanEditObjective } from './keyResultService.js';

/**
 * Reflections — FR-027: "free-text retrospective commentary... against
 * that Objective, typically at Cycle close." Append-only — FR-027 never
 * mentions editing a Reflection after submission, and a retrospective
 * that can be silently rewritten afterward defeats its own purpose, so
 * no updateReflection exists deliberately, not as an oversight.
 */

const REFLECTION_FIELDS = `
  r.id, r.tenant_id AS "tenantId", r.objective_id AS "objectiveId",
  r.author_id AS "authorId", r.content, r.submitted_at AS "submittedAt"
`;

/**
 * Reflection content stays restricted to owner, owner's Manager, and
 * TenantAdmin — same reasoning and same gap-closed-here as
 * checkInService.js's listCheckInsForKeyResult; see that function's
 * comment for the full explanation. This check did not exist before
 * this round.
 */
export async function listReflectionsForObjective(client, tenantId, caller, objectiveId) {
  const objective = await fetchObjectiveWithOwner(client, tenantId, objectiveId);
  if (!objective) throw new NotFoundError('Objective not found');
  const allowed = caller.role === 'TenantAdmin' || objective.ownerId === caller.id || objective.ownerManagerId === caller.id;
  if (!allowed) throw new ForbiddenError('Only the Objective owner, their Manager, or a Tenant Administrator can view Reflections');

  const { rows } = await client.query(
    `SELECT ${REFLECTION_FIELDS} FROM okr.reflection r
     WHERE r.tenant_id = $1 AND r.objective_id = $2
     ORDER BY r.submitted_at DESC`,
    [tenantId, objectiveId]
  );
  return rows;
}

export async function createReflection(client, tenantId, caller, objectiveId, { content }) {
  if (!(await isElementEnabled(client, tenantId, 'Reflection'))) {
    throw new ValidationError('Reflections are disabled for this tenant (FR-025) — enable them under OKR Settings first');
  }

  const objective = await fetchObjectiveWithOwner(client, tenantId, objectiveId);
  if (!objective) throw new NotFoundError('Objective not found');
  assertCanEditObjective(objective, caller);

  if (!content?.trim()) throw new ValidationError('content is required');

  const { rows } = await client.query(
    `INSERT INTO okr.reflection AS r (id, tenant_id, objective_id, author_id, content)
     VALUES (gen_random_uuid(), $1, $2, $3, $4)
     RETURNING ${REFLECTION_FIELDS}`,
    [tenantId, objectiveId, caller.id, content.trim()]
  );
  return rows[0];
}
