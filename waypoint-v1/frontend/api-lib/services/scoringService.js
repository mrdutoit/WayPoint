/**
 * FR-019 score roll-up — replaces the Module 2 stubs
 * (objectiveService.js's old computeObjectiveStatus,
 * keyResultService.js's old computeKeyResultStatus) that could only
 * ever return 'Not Started', since no Check-in could exist before this
 * module. Both are now real, DB-backed, and called from inside the
 * same transaction as whatever wrote the Check-in that triggered them.
 *
 * Two genuine gaps in FR-019's literal text, resolved here and flagged
 * rather than silently picked:
 *
 * 1. "Objective status is computed server-side as the weighted average
 *    of its Key Results' scores" — Key Result has a `weighting` column
 *    to weight by; Objective has no equivalent field for weighting a
 *    *child Objective's* contribution during roll-up. Implemented as an
 *    EQUAL-weighted average across child Objectives, since there's
 *    nothing in the data model to weight by otherwise. If Objectives
 *    were meant to carry their own weighting for this purpose, that's a
 *    schema addition beyond what FR-019 or the data model asked for.
 * 2. Whether a parent Objective's status comes from its own Key
 *    Results, its child Objectives, or both, is never stated — FR-019
 *    just says "Roll-up to the cascade level above uses the same
 *    method against linked child Objectives" as if it were an
 *    additional step. Implemented as: an Objective with no children
 *    scores from its own Key Results (the base case, unambiguous); an
 *    Objective *with* children scores from its children instead of its
 *    own Key Results — not both combined, since there's no specified
 *    way to weight "a child Objective" against "a Key Result" in the
 *    same average. This matches the common OKR pattern where only
 *    leaf-level Objectives carry Key Results directly and higher
 *    cascade levels exist to aggregate, but WayPoint's schema doesn't
 *    actually enforce that — an Objective can have both children and
 *    its own Key Results, and this resolution means the latter would be
 *    ignored for roll-up purposes in that case. Flag if that's wrong.
 *
 * Both functions round to the nearest of the tenant's *current* rubric
 * levels (not whatever rubric was active when a given Check-in was
 * submitted) — a rubric can only be renamed, not have level_index
 * reordered, by cascadeLevelService's sibling scoringRubricService, so
 * this always reflects "where does this land today."
 */

function closestLevel(levels, averageIndex) {
  let closest = levels[0];
  let closestDiff = Math.abs(levels[0].level_index - averageIndex);
  for (const level of levels) {
    const diff = Math.abs(level.level_index - averageIndex);
    if (diff < closestDiff) { closest = level; closestDiff = diff; } // ties keep the lower level_index — deterministic, not fought over further
  }
  return closest;
}

async function getTenantRubricLevels(client, tenantId) {
  const { rows } = await client.query(
    `SELECT rl.level_index, rl.label
     FROM okr.rubric_level rl
     JOIN okr.scoring_rubric sr ON sr.id = rl.rubric_id
     WHERE sr.tenant_id = $1
     ORDER BY rl.level_index ASC`,
    [tenantId]
  );
  return rows;
}

/**
 * FR-019 (Key Result half) + FR-024: the rubric level label of the Key
 * Result's most recent Check-in, or 'Not Started' if it has none. Must
 * be called from inside the same transaction as the Check-in insert
 * that triggered it.
 */
export async function recomputeKeyResultStatus(client, tenantId, keyResultId) {
  const { rows } = await client.query(
    `SELECT rl.label
     FROM okr.check_in ci
     JOIN okr.rubric_level rl ON rl.id = ci.rubric_level_id
     WHERE ci.tenant_id = $1 AND ci.key_result_id = $2
     ORDER BY ci.submitted_at DESC
     LIMIT 1`,
    [tenantId, keyResultId]
  );
  const status = rows[0]?.label ?? 'Not Started';
  await client.query(
    `UPDATE okr.key_result SET status = $3 WHERE tenant_id = $1 AND id = $2`,
    [tenantId, keyResultId, status]
  );
  return status;
}

/**
 * FR-019 (Objective half) + FR-024, including the cascade-upward roll-up
 * — see the module comment for the two resolved ambiguities. Recomputes
 * `objectiveId`, persists it, then recurses to its parent (if any) so a
 * single Check-in correctly propagates status changes all the way up
 * the cascade, not just one level. FR-023 already guarantees the parent
 * chain has no cycles, so this recursion is guaranteed to terminate.
 */
export async function recomputeObjectiveStatus(client, tenantId, objectiveId) {
  const { rows: children } = await client.query(
    `SELECT status FROM okr.objective WHERE tenant_id = $1 AND parent_objective_id = $2`,
    [tenantId, objectiveId]
  );

  let status = 'Not Started';
  const levels = await getTenantRubricLevels(client, tenantId);

  if (children.length > 0) {
    if (levels.length > 0) {
      const scored = children
        .map((c) => levels.find((l) => l.label === c.status))
        .filter(Boolean); // drop children whose status is 'Not Started' or otherwise doesn't match a current level
      if (scored.length > 0) {
        const averageIndex = scored.reduce((sum, l) => sum + l.level_index, 0) / scored.length;
        status = closestLevel(levels, averageIndex).label;
      }
    }
  } else {
    const { rows: scored } = await client.query(
      `SELECT kr.weighting, latest.level_index
       FROM okr.key_result kr
       JOIN LATERAL (
         SELECT rl.level_index
         FROM okr.check_in ci
         JOIN okr.rubric_level rl ON rl.id = ci.rubric_level_id
         WHERE ci.key_result_id = kr.id AND ci.tenant_id = $1
         ORDER BY ci.submitted_at DESC
         LIMIT 1
       ) latest ON true
       WHERE kr.tenant_id = $1 AND kr.objective_id = $2`,
      [tenantId, objectiveId]
    );
    if (scored.length > 0 && levels.length > 0) {
      const totalWeight = scored.reduce((sum, r) => sum + Number(r.weighting), 0);
      const weightedSum = scored.reduce((sum, r) => sum + Number(r.weighting) * r.level_index, 0);
      status = closestLevel(levels, weightedSum / totalWeight).label;
    }
  }

  await client.query(
    `UPDATE okr.objective SET status = $3 WHERE tenant_id = $1 AND id = $2`,
    [tenantId, objectiveId, status]
  );

  const { rows: parentRows } = await client.query(
    `SELECT parent_objective_id AS "parentId" FROM okr.objective WHERE tenant_id = $1 AND id = $2`,
    [tenantId, objectiveId]
  );
  const parentId = parentRows[0]?.parentId;
  if (parentId) {
    await recomputeObjectiveStatus(client, tenantId, parentId);
  }

  return status;
}
