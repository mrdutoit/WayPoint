# WayPoint — Status

Current state and next steps. This is the part that goes stale — check
dates and re-verify against the actual repo/deployment before trusting
anything here, especially if it's been a while. For the stable
architecture description, see `reference.md` alongside this file.

**Last updated:** FR-033 Reporting & Dashboards shipped — the four
reports the Stage 2 doc's approved API table actually specifies
(scorecard, team-progress, alignment-map, checkin-compliance), out of
the eight named in its narrative section 5. 323 mocked tests + 27
real-Postgres integration tests. Migration 06 (theme/avatar/timezone)
confirmed applied last round is now folded into `schema.sql`;
`db/migrations/07-initiative-checkin-reflection.sql` remains pending.

## Where things actually stand

- **Stage 1 (Requirements):** Complete.
- **Stage 2 (Architecture & Design):** Complete. Six-persona design
  review done. Requirements and Architecture document is at v0.3; Stage
  2 Architecture and Design is at v0.4.
- **Stage 3 (Scaffold):** Complete and verified working end to end in
  production.
- **Stage 4 (Full build, module by module):**
  - Module 1 (Authentication and user management) — complete, including
    the tenant-provisioning/user-invite/password-management follow-up.
  - Module 2 (Objective, Key Result, Cascade) — complete.
  - Module 3 (Initiative, Check-in, Reflection) — complete, including
    the real FR-019 scoring roll-up.
  - FR-033 (Reporting & Dashboards) — complete for the four reports the
    Stage 2 doc's approved API table actually specifies (scorecard,
    team-progress, alignment-map, checkin-compliance). Four more are
    named in the doc's narrative section 5 but never given an API
    endpoint (cycle-over-cycle trend, Initiative execution status,
    Reflection digest, cross-tenant adoption) — not built, flagged
    rather than assumed out of scope permanently.
  - FR-013 (Terminology) and FR-025 (OKR element toggles) — pulled
    forward from Module 7 ahead of Module 2, at Mark's request.
  - FR-021 (Billing Mode UI), FR-030-032 (Data Export, Audit Log
    Export, Retention/Erasure) — not started; these were the other two
    options offered alongside Reporting when this round started.
  - FR-022 (AI Settings scaffold UI), FR-028/029 (Field-Level
    Encryption, SSO) — deliberately deferred per the Stage 1/2 docs
    themselves, not just unstarted.
- **Pre-Handover Review:** Correctly not yet run — belongs after Stage 4
  completes, before Stage 5.

**Cross-cutting, not tied to a Module number:** a self-service Settings
page (theme + avatar + timezone preference) — personal account settings
apply to every role regardless of which OKR modules exist yet, so this
was built as its own thing rather than folded into a specific Module.

## Earlier rounds — brief summary (full reasoning preserved in `reference.md`)

Router 404 bug fixed (`parseSlug`, ported from MedBroker, applied to
every router). Cadence entity + date-driven Cycle rework shipped.
Custom `DatePicker` matching MedBroker's pattern. FR-013/FR-025 pulled
forward from Module 7. Settings page (theme, avatar, timezone,
Profile, Security) built to match MedBroker's actual depth, not just
its mechanism — including a separate Unlock action distinct from
force-password-reset. `tokens.js` converted to CSS variables for
theming, but the new `themes.css` was never actually imported anywhere
for a full round — every form field rendered invisibly in production
until caught and fixed (the compiled CSS bundle size was the
give-away: flat at 0.50-0.56 kB across many builds despite the file
existing, jumped to 1.57 kB once the import landed). A migration edited
mid-round without checking whether its original version had already
been applied broke on Mark's real database the same way — fixed with
`ADD COLUMN IF NOT EXISTS`, now the standing default for every
migration in this project. Module 3 (Initiative, Check-in, Reflection)
shipped the real FR-019 scoring roll-up, replacing the Module 2 stub —
two genuine gaps in FR-019's literal text (Objective has no weighting
column to roll up "weighted" by; whether a parent scores from its own
Key Results, its children, or both is never stated) resolved and
documented in `scoringService.js` and `reference.md`, verified
end-to-end against real Postgres including a multi-level cascade. All
of the above is stable and confirmed working as of this note.

## This round — FR-033 Reporting & Dashboards

Built the four reports the Stage 2 doc's *approved API table*
specifies — `reportingService.js`'s `getScorecard`, `getTeamProgress`,
`getAlignmentMap`, `getCheckinCompliance` — not all eight named in the
doc's narrative section 5. That's a real gap in the doc itself (section
5 lists eight report types; section 4's API table only gives four of
them an endpoint), surfaced rather than silently picked one way:
cycle-over-cycle trend, Initiative execution status, Reflection digest,
and cross-tenant adoption are identified, not built.

Two scope interpretations resolved and documented, not guessed at
silently:

- **Check-in compliance** ("who is checking in on schedule and who
  isn't") has no schedule concept to check against — WayPoint's only
  cadence concept is a Cycle's own length (Monthly/Quarterly/etc.),
  not a per-Check-in frequency within a Cycle. Built the coarser,
  actually-buildable version: has each Key Result received *any*
  Check-in this Cycle, grouped by owner — not a fine-grained "on this
  week's schedule" tracker.
- **Team progress "risk" sorting** ("lowest confidence or score
  first") reads as either could be primary. Resolved as: current
  rubric level first (a Key Result with zero Check-ins sorts as worst
  of all — "untouched" is at least as risky as "touched and scored
  low"), latest confidence as the tie-breaker.

CSV/JSON export, which the doc says all reports share with FR-030, is
deliberately not built — FR-030 (Data Export) itself doesn't exist yet,
so there's no shared mechanism to reuse; building a one-off exporter
for just these four reports risked a second, inconsistent mechanism
once FR-030 actually ships. These four reports are view-only for now.

Frontend: a `Reports.jsx` landing page gated by role, `Scorecard.jsx`,
`TeamProgress.jsx`, `CheckinCompliance.jsx`, and `AlignmentMap.jsx` —
the last with a collapse/expand tree per the Stage 2 design review's
explicit requirement (Sam) that a deep cascade stay usable, not render
fully by default.

323 mocked tests + 27 real-Postgres integration tests (up from 22 —
5 new, covering all four reports against a real multi-employee,
multi-level dataset, including the exact LATERAL-join and
risk-ordering logic mocked tests can't validate). Nothing pending to
apply this round — no schema changes.

## Next immediate step

1. Apply `db/migrations/07-initiative-checkin-reflection.sql` via the
   Neon SQL console, then delete it from GitHub yourself and confirm so
   it can be folded into `schema.sql` next round.
2. Push this delta to GitHub and let Vercel redeploy.
3. Re-verify end to end: as an Employee, view your own scorecard; as a
   Manager, view team progress and confirm the worst-scored direct
   report actually sorts first; as a TenantAdmin, open the alignment
   map and confirm collapse/expand works on a real multi-level tree,
   then check-in compliance and confirm it correctly shows both
   checked-in and not-checked-in Key Results for the same person. None
   of this has been seen in the deployed app yet — only in the sandbox.
4. Module 3 (Initiative, Check-in, Reflection) is confirmed working in
   production as of this round — no further re-verification needed
   there unless something changes.
5. Then pick the next piece from what's still open: FR-021 (Billing
   Mode UI), FR-030-032 (Data Export/Retention/Erasure), or the four
   report types this round didn't build (see "This round," above).

## Open items, not yet resolved

- Trademark/domain check on "WayPoint" — low priority, no external
  client yet.
- No second database region or Azure migration — deliberately deferred.
- Self-service "forgot password" has a backend but no frontend —
  needs an explicit decision, not a default assumption.
- Session persistence and revocation — same; also why "force logout"
  wasn't built into User Management (see `reference.md`).
- FR-015's "at their permitted cascade level" has no defined role→level
  permission mapping — flagged when Module 2 shipped, still open.
- No admin-side UI to edit a user's name after creation — Settings'
  Profile section is read-only because of this, not by design choice.
- Two FR-019 interpretations were resolved rather than confirmed with
  Mark (Objective roll-up is equal-weighted, not weighted — Objective
  has no weighting field; a parent with children scores from children
  only, not its own Key Results too) — see `scoringService.js`'s module
  comment and this file's Module 3 section above. Worth a direct
  confirmation once there's a real multi-level OKR tree to look at.
- The Check-in confidence scale (1-5) is an inferred choice, not a
  literal FR-018 requirement — flag if a different scale was actually
  intended.

## For a new chat picking this up

Read `reference.md` first (architecture, decisions, structure), then
this file. The repo itself (`github.com/mrdutoit/WayPoint`,
`waypoint-v1` folder) is the actual source of truth for what's built —
these two files are a map, not a substitute for reading the code when
precision matters.
