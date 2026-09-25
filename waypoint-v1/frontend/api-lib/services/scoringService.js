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
 * Inputs to the roll-up: the Objective's own Key Results (weighted-
 * averaged among themselves into ONE item — 2026-09-23 fix) plus each
 * child Objective (one equally-weighted item each).
 *
 * 2026-09-24 — completion gate. Until now an unscored input (a Key
 * Result with no Check-in, a child still "Not Started") simply dropped
 * out of the average, which produced exactly what Mark saw live: a Team
 * Objective reading "Achieved" while its Individual child hadn't
 * started, and that "Achieved" then rolling straight up to Division and
 * Company. The average answers "how healthy is the work reported so
 * far"; it cannot answer "is this done". Two rules now apply:
 *
 *   1. Unscored inputs still don't drag the average down — penalising
 *      them would make every fresh Cycle read Off Track on day one, which
 *      is noise, not signal.
 *   2. The rubric's top level (highest level_index — "Achieved" in the
 *      default rubric) is a completion state, not an average. An
 *      Objective reaches it only when EVERY input is scored AND every
 *      input is itself at the top level. Otherwise the result is capped
 *      one level below the top ("On Track"): healthy, not finished.
 *
 * So a parent can never read "Achieved" while anything beneath it is
 * unstarted or merely on track — and because the cap applies at every
 * level, it propagates up the whole cascade.
 */
export async function recomputeObjectiveStatus(client, tenantId, objectiveId) {
  const levels = await getTenantRubricLevels(client, tenantId);
  const scoredIndexes = []; // one level_index per scored input
  let inputCount = 0; // every input, scored or not (own Key Results count as ONE averaged input)
  // Coverage for display (2026-09-25): counted per Key Result and per
  // child, not per averaged block, because "2 of 3 reporting" is read by
  // people as "2 of the 3 things underneath have reported".
  let reporting = 0;
  let total = 0;
  let allInputsComplete = true; // every input scored AND at the top level

  if (levels.length > 0) {
    const topIndex = levels[levels.length - 1].level_index; // levels are ORDER BY level_index ASC

    // LEFT JOIN, not JOIN: a Key Result with no Check-in comes back with
    // level_index NULL. It's excluded from the average but still counts
    // as an input, which is what blocks the top level (rule 2 above).
    const { rows: ownKeyResults } = await client.query(
      `SELECT kr.weighting, latest.level_index
       FROM okr.key_result kr
       LEFT JOIN LATERAL (
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
      inputCount += 1;
      const scored = ownKeyResults.filter((r) => r.level_index !== null && r.level_index !== undefined);
      total += ownKeyResults.length;
      reporting += scored.length;
      if (scored.length < ownKeyResults.length) allInputsComplete = false;
      if (scored.some((r) => r.level_index !== topIndex)) allInputsComplete = false;
      const totalWeight = scored.reduce((sum, r) => sum + Number(r.weighting), 0);
      const weightedSum = scored.reduce((sum, r) => sum + Number(r.weighting) * r.level_index, 0);
      if (totalWeight > 0) scoredIndexes.push(weightedSum / totalWeight);
      else if (scored.length > 0) scoredIndexes.push(scored.reduce((sum, r) => sum + r.level_index, 0) / scored.length); // all weightings 0 — fall back to a plain average rather than silently dropping them
    }

    const { rows: children } = await client.query(
      `SELECT status FROM okr.objective WHERE tenant_id = $1 AND parent_objective_id = $2`,
      [tenantId, objectiveId]
    );
    for (const child of children) {
      inputCount += 1;
      total += 1;
      const level = levels.find((l) => l.label === child.status);
      if (level) {
        reporting += 1;
        scoredIndexes.push(level.level_index);
        if (level.level_index !== topIndex) allInputsComplete = false;
      } else {
        allInputsComplete = false; // 'Not Started' (or an unrecognised label) — excluded from the average, blocks completion
      }
    }

    if (scoredIndexes.length > 0) {
      let level = closestLevel(levels, scoredIndexes.reduce((sum, idx) => sum + idx, 0) / scoredIndexes.length);
      if (level.level_index === topIndex && !(allInputsComplete && inputCount > 0) && levels.length > 1) {
        level = levels[levels.length - 2];
      }
      return persistAndCascade(client, tenantId, objectiveId, level.label, reporting, total);
    }
  }

  return persistAndCascade(client, tenantId, objectiveId, 'Not Started', reporting, total);
}

async function persistAndCascade(client, tenantId, objectiveId, status, reporting = 0, total = 0) {
  await client.query(
    `UPDATE okr.objective SET status = $3, inputs_reporting = $4, inputs_total = $5 WHERE tenant_id = $1 AND id = $2`,
    [tenantId, objectiveId, status, reporting, total]
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

/**
 * One-off repair: recomputes every Key Result and Objective status for
 * a tenant from scratch. Needed whenever the roll-up RULES change (as
 * on 2026-09-24) — stored statuses were computed under the old rules
 * and nothing re-triggers them until a new Check-in lands. Also the
 * manual remedy for the rubric-label-rename staleness in status.md's
 * open items. Not wired to any user-facing screen — run from
 * tools/bootstrap-admin.html, gated by BOOTSTRAP_SECRET.
 *
 * Order matters: Key Results first (Objectives read their latest
 * Check-in level directly, but child Objective *statuses* are read from
 * the stored column), then every leaf Objective — recomputeObjectiveStatus
 * cascades upward from each, and a parent's final recompute always runs
 * after its last child's, so every ancestor ends up correct.
 */
export async function recomputeTenantStatuses(client, tenantId) {
  const { rows: keyResults } = await client.query(
    `SELECT id FROM okr.key_result WHERE tenant_id = $1`,
    [tenantId]
  );
  for (const kr of keyResults) await recomputeKeyResultStatus(client, tenantId, kr.id);

  const { rows: leaves } = await client.query(
    `SELECT o.id FROM okr.objective o
     WHERE o.tenant_id = $1
       AND NOT EXISTS (SELECT 1 FROM okr.objective c WHERE c.tenant_id = $1 AND c.parent_objective_id = o.id)`,
    [tenantId]
  );
  for (const leaf of leaves) await recomputeObjectiveStatus(client, tenantId, leaf.id);

  return { keyResults: keyResults.length, leafObjectives: leaves.length };
}
