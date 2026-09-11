/**
 * Objectives — FR-004 (status never client-writable), FR-015 (creation
 * and cascade), FR-019 (roll-up — partial, see below), FR-020
 * (visibility), FR-023 (no cascade cycle), FR-024 ("Not Started" edge
 * case).
 *
 * Two open design points, called out here rather than silently decided,
 * because they weren't pinned down by an FR and are expensive to reverse
 * once Objectives exist against the wrong rule:
 *
 * 1. "at their permitted cascade level" (FR-015) — no FR defines a
 *    role → cascade-level permission mapping, so this module does not
 *    enforce one: any cascade level belonging to the tenant is
 *    accepted. If a real restriction is wanted (e.g. Employee cannot
 *    create a Company-level Objective), it needs a rule to encode —
 *    flagging for Mark rather than inventing one.
 * 2. Ownership on create — a Manager may set ownerId to a direct report
 *    (owner.managerId === caller.id) or themselves; an Employee may only
 *    own their own Objectives. Inferred from user stories 7/8 and
 *    FR-020's owner+manager visibility pairing, not stated as its own FR.
 */

// Re-exported for convenience so existing call sites (routers, other
// services) can import these alongside objectiveService's own functions —
// the classes themselves live in errors.js, shared across all of Module 2.
export { ValidationError, ForbiddenError, NotFoundError } from './errors.js';
import { ValidationError, ForbiddenError, NotFoundError } from './errors.js';

const OBJECTIVE_FIELDS = `
  o.id, o.tenant_id AS "tenantId", o.cycle_id AS "cycleId",
  o.cascade_level_id AS "cascadeLevelId", o.parent_objective_id AS "parentObjectiveId",
  o.owner_id AS "ownerId", o.title, o.status, o.created_at AS "createdAt"
`;

/**
 * FR-020: "An Objective and its Key Results are visible to their owner
 * and the owner's direct Manager only." Applied literally — a
 * TenantAdmin does not get blanket visibility here; org-wide viewing is
 * the dedicated GET /api/reports/alignment-map endpoint (Module 6), not
 * this list. Flag to Mark if TenantAdmin was expected to see everything
 * via this endpoint too.
 */
export async function listObjectivesForCaller(client, tenantId, caller) {
  const { rows } = await client.query(
    `SELECT ${OBJECTIVE_FIELDS}
     FROM okr.objective o
     JOIN okr.user_account owner ON owner.id = o.owner_id
     WHERE o.tenant_id = $1
       AND (o.owner_id = $2 OR owner.manager_id = $2)
     ORDER BY o.created_at DESC`,
    [tenantId, caller.id]
  );
  return rows;
}

async function fetchObjectiveRow(client, tenantId, objectiveId) {
  const { rows } = await client.query(
    `SELECT ${OBJECTIVE_FIELDS}, owner.manager_id AS "ownerManagerId"
     FROM okr.objective o
     JOIN okr.user_account owner ON owner.id = o.owner_id
     WHERE o.tenant_id = $1 AND o.id = $2`,
    [tenantId, objectiveId]
  );
  return rows[0] ?? null;
}

function assertVisible(objectiveRow, caller) {
  const visible = objectiveRow.ownerId === caller.id || objectiveRow.ownerManagerId === caller.id;
  if (!visible) throw new ForbiddenError('You do not have access to this Objective');
}

export async function getObjectiveForCaller(client, tenantId, objectiveId, caller) {
  const row = await fetchObjectiveRow(client, tenantId, objectiveId);
  if (!row) throw new NotFoundError('Objective not found');
  assertVisible(row, caller);
  const { ownerManagerId, ...objective } = row;
  return objective;
}

/**
 * FR-023: walks the parent chain of `candidateParentId` and rejects if
 * `objectiveId` (its own id, on update) appears anywhere in it — the
 * cascade-cycle guard added following the Stage 2 design review (Alex).
 * On create, objectiveId is null (a brand-new row cannot yet be anyone's
 * ancestor), so this only ever rejects something on the update path.
 */
async function assertNoCascadeCycle(client, tenantId, candidateParentId, objectiveId) {
  let current = candidateParentId;
  const seen = new Set();
  while (current) {
    if (current === objectiveId) {
      throw new ValidationError('This would link the Objective as its own ancestor (FR-023)');
    }
    if (seen.has(current)) break; // defensive — an existing cycle should be impossible, but never loop forever
    seen.add(current);
    const { rows } = await client.query(
      `SELECT parent_objective_id FROM okr.objective WHERE tenant_id = $1 AND id = $2`,
      [tenantId, current]
    );
    current = rows[0]?.parent_objective_id ?? null;
  }
}

async function assertParentIsOneLevelAbove(client, tenantId, parentObjectiveId, cascadeLevelId) {
  const { rows } = await client.query(
    `SELECT o.id, cl_parent.level_index AS "parentLevelIndex", cl_child.level_index AS "childLevelIndex"
     FROM okr.objective o
     JOIN okr.cascade_level cl_parent ON cl_parent.id = o.cascade_level_id
     JOIN okr.cascade_level cl_child ON cl_child.id = $3
     WHERE o.tenant_id = $1 AND o.id = $2`,
    [tenantId, parentObjectiveId, cascadeLevelId]
  );
  const row = rows[0];
  if (!row) throw new ValidationError('parentObjectiveId does not exist in this tenant');
  if (row.parentLevelIndex !== row.childLevelIndex - 1) {
    throw new ValidationError('parentObjectiveId must be at the cascade level directly above this Objective (FR-015)');
  }
}

/**
 * "Active" Cycle is now computed from today's date, not a manually
 * toggled flag — see cycleService.js's module comment for why. The
 * database's EXCLUDE constraint on okr.cycle guarantees at most one row
 * can ever match this, so no ORDER BY/LIMIT tie-break is needed beyond
 * LIMIT 1 as a defensive floor.
 */
async function resolveActiveCycle(client, tenantId) {
  const { rows } = await client.query(
    `SELECT id FROM okr.cycle WHERE tenant_id = $1 AND CURRENT_DATE BETWEEN start_date AND end_date LIMIT 1`,
    [tenantId]
  );
  if (rows.length === 0) {
    throw new ValidationError('No Cycle covers today\'s date for this tenant — create one that does before creating Objectives (FR-014/FR-015)');
  }
  return rows[0].id;
}

function assertCanOwn(caller, ownerId, ownerRow) {
  if (ownerId === caller.id) return;
  if (caller.role === 'Manager' && ownerRow?.managerId === caller.id) return;
  throw new ForbiddenError('You can only create Objectives for yourself or a direct report');
}

export async function createObjective(client, tenantId, caller, { title, cascadeLevelId, parentObjectiveId, ownerId }) {
  if (!['Manager', 'Employee'].includes(caller.role)) {
    throw new ForbiddenError('Only a Manager or Employee can create an Objective');
  }
  if (!title?.trim()) throw new ValidationError('title is required');
  if (!cascadeLevelId) throw new ValidationError('cascadeLevelId is required');

  const targetOwnerId = ownerId ?? caller.id;
  let ownerRow = null;
  if (targetOwnerId !== caller.id) {
    const { rows } = await client.query(
      `SELECT id, manager_id AS "managerId" FROM okr.user_account WHERE tenant_id = $1 AND id = $2`,
      [tenantId, targetOwnerId]
    );
    ownerRow = rows[0] ?? null;
    if (!ownerRow) throw new ValidationError('ownerId does not exist in this tenant');
  }
  assertCanOwn(caller, targetOwnerId, ownerRow);

  const { rows: levelRows } = await client.query(
    `SELECT id FROM okr.cascade_level WHERE tenant_id = $1 AND id = $2`,
    [tenantId, cascadeLevelId]
  );
  if (levelRows.length === 0) throw new ValidationError('cascadeLevelId does not exist in this tenant');

  if (parentObjectiveId) {
    await assertParentIsOneLevelAbove(client, tenantId, parentObjectiveId, cascadeLevelId);
    await assertNoCascadeCycle(client, tenantId, parentObjectiveId, null);
  }

  const cycleId = await resolveActiveCycle(client, tenantId);

  const { rows } = await client.query(
    `INSERT INTO okr.objective (id, tenant_id, cycle_id, cascade_level_id, parent_objective_id, owner_id, title, status)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'Not Started')
     RETURNING ${OBJECTIVE_FIELDS}`,
    [tenantId, cycleId, cascadeLevelId, parentObjectiveId ?? null, targetOwnerId, title.trim()]
  );
  return rows[0];
}

/**
 * Owner or the owner's direct Manager only (matches FR-020's visibility
 * pairing). `status` is deliberately not an accepted field — see FR-004.
 */
export async function updateObjective(client, tenantId, caller, objectiveId, { title, parentObjectiveId }) {
  const existing = await fetchObjectiveRow(client, tenantId, objectiveId);
  if (!existing) throw new NotFoundError('Objective not found');
  assertVisible(existing, caller);

  const nextTitle = title !== undefined ? title : existing.title;
  if (!nextTitle?.trim()) throw new ValidationError('title cannot be empty');

  const nextParentId = parentObjectiveId !== undefined ? parentObjectiveId : existing.parentObjectiveId;
  if (nextParentId) {
    await assertParentIsOneLevelAbove(client, tenantId, nextParentId, existing.cascadeLevelId);
    await assertNoCascadeCycle(client, tenantId, nextParentId, objectiveId);
  }

  const { rows } = await client.query(
    `UPDATE okr.objective SET title = $3, parent_objective_id = $4
     WHERE tenant_id = $1 AND id = $2
     RETURNING ${OBJECTIVE_FIELDS}`,
    [tenantId, objectiveId, nextTitle.trim(), nextParentId ?? null]
  );
  return rows[0];
}

/**
 * FR-024 (Objective half) + the trivial case of FR-019: an Objective
 * with no Key Results (or whose Key Results are all still "Not Started",
 * which is every Key Result until Module 3 ships Check-ins) has no
 * computed score and stays "Not Started" rather than defaulting to a
 * rubric level. The weighted-average roll-up against real rubric scores
 * is genuinely blocked on Check-in existing — see keyResultService.js —
 * so it is not implemented here yet rather than implemented against data
 * that cannot currently exist.
 */
export function computeObjectiveStatus(keyResultStatuses) {
  if (keyResultStatuses.length === 0) return 'Not Started';
  if (keyResultStatuses.every((s) => s === 'Not Started')) return 'Not Started';
  throw new Error('Weighted roll-up against real Key Result scores ships with Module 3 (Check-ins)');
}
