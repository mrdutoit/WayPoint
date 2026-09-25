import { ForbiddenError, NotFoundError } from './errors.js';

/**
 * FR-033 — reports computed on demand against the operational
 * database, no materialised-view layer (per the Stage 2 doc's own
 * sizing conclusion in section 8).
 *
 * The Stage 2 doc's section 5 lists eight report types; its section 4
 * API design table — the actual approved build contract — only
 * specifies endpoints for four of them (scorecard, team-progress,
 * alignment-map, checkin-compliance). Only those four are built here.
 * Cycle-over-cycle trend, Initiative execution status, Reflection
 * digest, and Cross-tenant adoption are identified, not built — flag
 * if any of those are actually needed; the pattern below extends
 * cleanly to them.
 *
 * CSV/JSON export ("All reports are exportable through the same
 * mechanism as FR-030") is deliberately not built here either — FR-030
 * itself (Data Export) hasn't been built, so there is no shared export
 * mechanism yet to reuse. Building a one-off exporter for just these
 * four reports risks a second, inconsistent mechanism once FR-030
 * actually ships. These reports are view-only for now.
 *
 * Report endpoint rate limiting (FR-033, section 9's WAF decision) is
 * Vercel WAF configuration, not application code — same as every other
 * rate-limited endpoint in this project (e.g. /api/auth/login). Not
 * something this service can enforce.
 */

async function findActiveCycle(client, tenantId) {
  const { rows } = await client.query(
    `SELECT id, name, start_date AS "startDate", end_date AS "endDate"
     FROM okr.cycle WHERE tenant_id = $1 AND CURRENT_DATE BETWEEN start_date AND end_date LIMIT 1`,
    [tenantId]
  );
  return rows[0] ?? null; // no throw — a report with no active Cycle shows "nothing active" rather than erroring
}

/**
 * FR-033's scorecard: "Self, Manager, Tenant Administrator." Visibility
 * is narrower than that role list implies — a Manager may view a
 * scorecard only for one of their own direct reports (or themselves),
 * not any employee in the tenant; TenantAdmin may view anyone's.
 */
export async function getScorecard(client, tenantId, caller, userId) {
  // 2026-09-24: always looks up the scorecard's subject (previously only
  // for the manager check) so the page can say WHOSE scorecard it is —
  // it used to render the same "Scorecard" heading for everyone, with
  // nothing on screen identifying the person. The same row serves the
  // direct-report check, so this is still one query, not two.
  const { rows: personRows } = await client.query(
    `SELECT id, first_name AS "firstName", last_name AS "lastName",
            avatar_option AS "avatarOption", manager_id AS "managerId"
     FROM okr.user_account WHERE tenant_id = $1 AND id = $2`,
    [tenantId, userId]
  );
  const subject = personRows[0];
  const allowed = caller.role === 'TenantAdmin' || caller.id === userId || (subject && subject.managerId === caller.id);
  if (!allowed) {
    throw new ForbiddenError('You can only view your own scorecard or a direct report\'s');
  }
  if (!subject) throw new NotFoundError('User not found');
  const person = { id: subject.id, firstName: subject.firstName, lastName: subject.lastName, avatarOption: subject.avatarOption };

  const cycle = await findActiveCycle(client, tenantId);
  if (!cycle) return { person, cycle: null, objectives: [] };

  const { rows: objectiveRows } = await client.query(
    `SELECT id, title, status, inputs_reporting AS "inputsReporting", inputs_total AS "inputsTotal" FROM okr.objective
     WHERE tenant_id = $1 AND cycle_id = $2 AND owner_id = $3
     ORDER BY created_at ASC`,
    [tenantId, cycle.id, userId]
  );

  const objectives = [];
  for (const objective of objectiveRows) {
    const { rows: keyResults } = await client.query(
      `SELECT id, title, weighting, status FROM okr.key_result
       WHERE tenant_id = $1 AND objective_id = $2 ORDER BY created_at ASC`,
      [tenantId, objective.id]
    );
    for (const kr of keyResults) {
      const { rows: checkIns } = await client.query(
        `SELECT ci.confidence, ci.comment, ci.submitted_at AS "submittedAt", rl.label AS "scoreLabel"
         FROM okr.check_in ci JOIN okr.rubric_level rl ON rl.id = ci.rubric_level_id
         WHERE ci.tenant_id = $1 AND ci.key_result_id = $2
         ORDER BY ci.submitted_at ASC`,
        [tenantId, kr.id]
      );
      kr.checkInHistory = checkIns;
      kr.confidenceTrend = checkIns.map((c) => ({ submittedAt: c.submittedAt, confidence: c.confidence }));
    }
    objectives.push({ ...objective, keyResults });
  }

  return { person, cycle, objectives };
}

/**
 * FR-033's team progress: "Direct reports' Objective/Key Result status,
 * sorted by risk — lowest confidence or score first." Returned as a
 * flat, sortable list of Key-Result-level rows across every direct
 * report's current-cycle Objectives, not nested per report — a flat
 * "riskiest things across my team" list is the more directly useful
 * shape for the stated purpose than a tree the Manager has to scan.
 *
 * "Risk" itself isn't defined precisely by FR-033 ("lowest confidence
 * OR score" reads as either could be primary) — resolved as: current
 * rubric level first (worse/lower first; a Key Result with no Check-ins
 * yet sorts as worst of all, since "hasn't been touched" is at least as
 * risky as "touched and scored low"), most recent confidence as the
 * tie-breaker. Flag if score and confidence were meant to combine into
 * a single weighted risk figure instead.
 */
export async function getTeamProgress(client, tenantId, caller) {
  if (caller.role !== 'Manager') throw new ForbiddenError('Only a Manager has direct reports to view');

  const cycle = await findActiveCycle(client, tenantId);
  if (!cycle) return { cycle: null, rows: [] };

  const { rows } = await client.query(
    `SELECT
       u.id AS "employeeId", u.first_name AS "employeeFirstName", u.last_name AS "employeeLastName",
       u.avatar_option AS "employeeAvatarOption",
       o.id AS "objectiveId", o.title AS "objectiveTitle", o.status AS "objectiveStatus",
       kr.id AS "keyResultId", kr.title AS "keyResultTitle", kr.status, kr.weighting,
       COALESCE(rl.level_index, 0) AS "levelIndex",
       latest.confidence AS "latestConfidence",
       latest.submitted_at AS "lastCheckInAt"
     FROM okr.user_account u
     JOIN okr.objective o ON o.tenant_id = u.tenant_id AND o.owner_id = u.id AND o.cycle_id = $2
     JOIN okr.key_result kr ON kr.tenant_id = u.tenant_id AND kr.objective_id = o.id
     LEFT JOIN okr.rubric_level rl ON rl.label = kr.status
     LEFT JOIN LATERAL (
       SELECT ci.confidence, ci.submitted_at FROM okr.check_in ci
       WHERE ci.key_result_id = kr.id ORDER BY ci.submitted_at DESC LIMIT 1
     ) latest ON true
     WHERE u.tenant_id = $1 AND u.manager_id = $3
     ORDER BY "levelIndex" ASC, "latestConfidence" ASC NULLS FIRST`,
    [tenantId, cycle.id, caller.id]
  );

  // 2026-09-24: every Check-in this Cycle on the Manager's own direct
  // reports' Key Results — drives Team Progress's per-person lanes (each
  // Check-in plotted where it happened, coloured by score, with its
  // detail on hover) and cadence strips (counted per day client-side).
  // No new exposure: a Manager can already see each report's full
  // Check-in history, comments included, on their Scorecard
  // (getScorecard's direct-report rule, and FR-018/checkInService's
  // owner-or-Manager read rule). Ordered by time for plotting.
  const { rows: checkIns } = await client.query(
    `SELECT u.id AS "employeeId", o.id AS "objectiveId", o.title AS "objectiveTitle",
            kr.id AS "keyResultId", kr.title AS "keyResultTitle",
            ci.submitted_at AS "submittedAt", ci.confidence, ci.comment, rl.label AS "scoreLabel"
     FROM okr.check_in ci
     JOIN okr.rubric_level rl ON rl.id = ci.rubric_level_id
     JOIN okr.key_result kr ON kr.id = ci.key_result_id
     JOIN okr.objective o ON o.id = kr.objective_id
     JOIN okr.user_account u ON u.id = o.owner_id
     WHERE ci.tenant_id = $1 AND o.cycle_id = $2 AND u.manager_id = $3
     ORDER BY ci.submitted_at ASC`,
    [tenantId, cycle.id, caller.id]
  );

  return { cycle, rows, checkIns };
}

/**
 * FR-033's alignment map: "Full cascade tree, company to individual,
 * with roll-up scores at each level." Returned flat (with
 * parentObjectiveId on each row) rather than pre-nested — the Stage 2
 * design review (Sam) requires collapse/expand for a deep cascade, and
 * a flat list with parent pointers is what a frontend tree component
 * needs anyway; nesting it server-side would just make the frontend
 * un-nest it again for that UI.
 *
 * Opened to any authenticated tenant member (was TenantAdmin-only) —
 * this is exactly the "see the shape of the whole cascade" view that
 * makes sense to open alongside the FR-020 Objective/Key Result
 * visibility broadening (objectiveService.js's module comment); no
 * reason to widen Objective visibility tenant-wide while leaving the
 * one view built specifically to show how they connect locked to a
 * single role.
 */
export async function getAlignmentMap(client, tenantId, caller) {
  const cycle = await findActiveCycle(client, tenantId);
  if (!cycle) return { cycle: null, objectives: [] };

  const { rows } = await client.query(
    `SELECT o.id, o.title, o.status, o.parent_objective_id AS "parentObjectiveId",
            o.inputs_reporting AS "inputsReporting", o.inputs_total AS "inputsTotal",
            cl.label AS "cascadeLevel", cl.level_index AS "cascadeLevelIndex",
            u.first_name AS "ownerFirstName", u.last_name AS "ownerLastName"
     FROM okr.objective o
     JOIN okr.cascade_level cl ON cl.id = o.cascade_level_id
     JOIN okr.user_account u ON u.id = o.owner_id
     WHERE o.tenant_id = $1 AND o.cycle_id = $2
     ORDER BY cl.level_index ASC, o.created_at ASC`,
    [tenantId, cycle.id]
  );

  return { cycle, objectives: rows };
}

/**
 * FR-033's check-in compliance: "Who is checking in on schedule and
 * who isn't." WayPoint has no separate "check-in frequency" setting
 * distinct from a Cycle's own Cadence (FR-018 says "on the cadence
 * configured for that tenant" but no such per-check-in schedule exists
 * in the data model built so far) — resolved as the coarser, buildable
 * version of this report: which Key Results have at least one
 * Check-in *this Cycle* versus none at all, grouped by owner. Not a
 * fine-grained "are they on this week's schedule" tracker — that would
 * need a schedule concept that doesn't exist yet. Flag if the
 * fine-grained version is actually what's needed.
 */
export async function getCheckinCompliance(client, tenantId, caller) {
  if (caller.role !== 'TenantAdmin') throw new ForbiddenError('Only a Tenant Administrator can view check-in compliance');

  const cycle = await findActiveCycle(client, tenantId);
  if (!cycle) return { cycle: null, byOwner: [] };

  const { rows } = await client.query(
    `SELECT
       u.id AS "employeeId", u.first_name AS "employeeFirstName", u.last_name AS "employeeLastName",
       u.avatar_option AS "employeeAvatarOption",
       kr.id AS "keyResultId", kr.title AS "keyResultTitle",
       EXISTS (
         SELECT 1 FROM okr.check_in ci WHERE ci.key_result_id = kr.id AND ci.tenant_id = $1
       ) AS "hasCheckedIn"
     FROM okr.objective o
     JOIN okr.user_account u ON u.id = o.owner_id
     JOIN okr.key_result kr ON kr.tenant_id = o.tenant_id AND kr.objective_id = o.id
     WHERE o.tenant_id = $1 AND o.cycle_id = $2
     ORDER BY u.first_name ASC, u.last_name ASC, kr.created_at ASC`,
    [tenantId, cycle.id]
  );

  // Cadence over the Cycle (calendar heatmap) needs *when* each
  // Check-in happened, not just whether one exists — a second, separate
  // query rather than folding into the one above, since this groups by
  // day instead of by Key Result and would otherwise force an awkward
  // double-grouping in one query.
  const { rows: dailyRows } = await client.query(
    `SELECT u.id AS "employeeId", ci.submitted_at::date AS "date", COUNT(*)::int AS "count"
     FROM okr.check_in ci
     JOIN okr.key_result kr ON kr.id = ci.key_result_id
     JOIN okr.objective o ON o.id = kr.objective_id
     JOIN okr.user_account u ON u.id = o.owner_id
     WHERE ci.tenant_id = $1 AND o.cycle_id = $2
     GROUP BY u.id, ci.submitted_at::date
     ORDER BY u.id, date`,
    [tenantId, cycle.id]
  );

  const byOwnerMap = new Map();
  for (const row of rows) {
    if (!byOwnerMap.has(row.employeeId)) {
      byOwnerMap.set(row.employeeId, {
        employeeId: row.employeeId,
        employeeFirstName: row.employeeFirstName,
        employeeLastName: row.employeeLastName,
        employeeAvatarOption: row.employeeAvatarOption,
        keyResults: [],
        checkInsByDate: [],
      });
    }
    byOwnerMap.get(row.employeeId).keyResults.push({
      keyResultId: row.keyResultId, keyResultTitle: row.keyResultTitle, hasCheckedIn: row.hasCheckedIn,
    });
  }
  for (const row of dailyRows) {
    // An owner can only have a daily count here if they own at least one
    // Key Result this Cycle, which the loop above already guarantees an
    // entry for — but guard anyway rather than assume query order.
    if (byOwnerMap.has(row.employeeId)) {
      byOwnerMap.get(row.employeeId).checkInsByDate.push({ date: row.date, count: row.count });
    }
  }

  return { cycle, byOwner: [...byOwnerMap.values()] };
}
