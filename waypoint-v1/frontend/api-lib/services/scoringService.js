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
 *    additional step. Originally implemented as either/or (children if
 *    any existed, else own Key Results), on the assumption that only
 *    leaf-level Objectives carry Key Results directly. Real usage
 *    (2026-09-23) proved that assumption false — WayPoint's schema
 *    doesn't enforce it, and a Company-level Objective with both its
 *    own checked-in Key Results and a Division child scored from the
 *    child alone, silently discarding Check-ins submitted right on it.
 *    Corrected to combine both: an Objective's own Key Results are
 *    weighted-averaged among themselves first, then that result counts
 *    as one more equally-weighted item alongside each child Objective —
 *    an Objective's own work counts for as much as any single child
 *    branch, not discarded the moment it has any children at all.
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
 * FR-019 (Objective half) + FR-024, including the cascade-upward roll-up.
 * Recomputes `objectiveId`, persists it, then recurses to its parent
 * (if any) so a single Check-in correctly propagates status changes all
 * the way up the cascade, not just one level. FR-023 already guarantees
 * the parent chain has no cycles, so this recursion is guaranteed to
 * terminate.
 *
 * 2026-09-23 correction: this used to score EITHER from child Objectives
 * OR from the Objective's own Key Results — never both, on the
 * assumption (flagged explicitly in this file's history as an
 * unresolved ambiguity, "flag if wrong") that only leaf-level Objectives
 * carry their own Key Results. Real usage proved that assumption false:
 * a Company-level Objective with both its own Key Results (checked in
 * directly) AND a Division-level child scored from the child alone,
 * silently ignoring Check-ins submitted right on it — status stuck at
 * "Not Started" despite an Achieved and an On Track Key Result
 * underneath it. Fixed to combine both: the Objective's own Key Results
 * are first weighted-averaged among themselves (unchanged from before),
 * then that result is treated as one more equally-weighted item
 * alongside each child Objective — an Objective's own work counts for
 * as much as any single child branch, rather than being discarded the
 * moment it has any children at all.
 */
export async function recomputeObjectiveStatus(client, tenantId, objectiveId) {
  const levels = await getTenantRubricLevels(client, tenantId);
  const scoredIndexes = []; // one level_index per scored input — own Key Results (as one combined item) and each scored child Objective

  if (levels.length > 0) {
    const { rows: ownKeyResults } = await client.query(
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
    if (ownKeyResults.length > 0) {
      const totalWeight = ownKeyResults.reduce((sum, r) => sum + Number(r.weighting), 0);
      const weightedSum = ownKeyResults.reduce((sum, r) => sum + Number(r.weighting) * r.level_index, 0);
      if (totalWeight > 0) scoredIndexes.push(weightedSum / totalWeight);
    }

    const { rows: children } = await client.query(
      `SELECT status FROM okr.objective WHERE tenant_id = $1 AND parent_objective_id = $2`,
      [tenantId, objectiveId]
    );
    for (const child of children) {
      const level = levels.find((l) => l.label === child.status);
      if (level) scoredIndexes.push(level.level_index); // a child still 'Not Started' (or an unrecognised status) contributes nothing, same as before
    }
  }

  const status = scoredIndexes.length > 0
    ? closestLevel(levels, scoredIndexes.reduce((sum, idx) => sum + idx, 0) / scoredIndexes.length).label
    : 'Not Started';

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
