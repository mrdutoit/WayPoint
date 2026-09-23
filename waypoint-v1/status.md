# WayPoint — Status

Current state and next steps. This is the part that goes stale — check
dates and re-verify against the actual repo/deployment before trusting
anything here, especially if it's been a while. For the stable
architecture description, see `reference.md` alongside this file.

**Last updated:** 2026-09-23. Originally reconstructed 2026-09-16 directly
from the GitHub repo (`mrdutoit/WayPoint`, `waypoint-v1`) rather than from a
session log — the previous version of this file said Stage 4 hadn't
started, which the repo contradicted (Modules 1–3 and part of Module 6
were already built and, per screenshots reviewed that session, working in
production). Treat this version as more trustworthy than pre-2026-09-16
versions, but still verify against the repo yourself before relying on
it — that's true of every version of this file, not just this one.

## Where things actually stand

- **Stage 1 (Requirements):** Complete.
- **Stage 2 (Architecture & Design):** Complete. Requirements and
  Architecture document is at v0.3, Stage 2 doc at v0.4.
- **Stage 3 (Scaffold):** Complete.
- **Stage 4 (Full build, module by module):**
  - Module 1 (Auth & user management): built — login, tenant/user
    provisioning, password reset/change, role guards.
  - Module 2 (Core entity CRUD — Objective, Key Result): built — list,
    detail, create, edit. No delete endpoint for either, matching the
    Stage 2 API design table, which never specified one — OKR history
    isn't meant to be deletable.
  - Module 3 (Secondary entities — Initiative, Check-in, Reflection):
    built — all three have working service/router/frontend code and are
    confirmed live (Reflections visible in a production screenshot
    reviewed this session).
  - Module 4 (Primary workflow — Check-in submission driving the
    Objective/Key Result score roll-up, FR-019): built —
    `scoringService.js`, called from `checkInService.js`.
  - Module 5 (Integrations): none identified in Stage 1 scope — N/A.
  - Module 6 (Reporting & dashboards): partially built. Four of the
    eight report types listed in the Stage 2 doc's section 5 are built
    (Scorecard, Team Progress, Alignment Map, Check-in Compliance) —
    matching the four the Stage 2 API design table actually specified.
    Cycle-over-cycle trend, Initiative execution status, Reflection
    digest, and Cross-tenant adoption are named in the doc but were
    never given an endpoint in the API table, so they're correctly
    unbuilt, not a gap against what was approved. All four built reports
    render as plain tables/lists, not charts.
  - Module 7 (Administration): built — cascade level config,
    terminology overrides, scoring rubric, OKR element toggles, user
    admin, tenant admin, feature flags admin all have corresponding
    services, routers, and pages.
  - Module 8 (Mobile app): not confirmed in Stage 1 scope.
- **Pre-Handover Review (security/performance/sizing):** Correctly not
  yet run — belongs after Stage 4 completes, before Stage 5.

This reconstruction is based on which files exist and what their code
does, not on a record of what was formally reviewed module-by-module —
the per-module dev-team review sign-off this skill calls for doesn't
appear to have left a trace in the repo itself. Worth re-establishing
that discipline going forward rather than treating "the code exists" as
equivalent to "the module was reviewed and closed out."

## What's confirmed working right now

- Sign-in (standalone auth, Argon2id + JWT), tenant/user provisioning
- Row-Level Security tenant isolation — now covering `initiative`,
  `check_in`, and `reflection` too (see Corrections below; these were
  missing their RLS policies in this file, though they should already be
  enabled directly in Neon if the tables are live and working)
- Feature flags: read + admin update, platform-wide
- Objective/Key Result creation, cascade linking (optional at creation,
  matching FR-015), re-parenting and cascade-level moves (edit — see
  2026-09-17 below), and a collapsible hierarchy view on the Objectives
  list itself (toggle against the existing flat table), matching
  Alignment Map's tree
- Check-in submission driving Key Result and Objective status roll-up —
  submittable either on the Key Result's own page or, as of 2026-09-20,
  inline right on the Objective page's Key Results table (last
  check-in date/warning chip shown per row, "Check in" expands the form
  in place — no navigation required for the common case)
- Initiatives and Reflections against Key Results/Objectives
- Reporting: Scorecard, Team Progress, Alignment Map (collapsible tree,
  not a visual canvas), Check-in Compliance — Dashboard, Team Progress,
  and Check-in Compliance lead with a Recharts-based chart (status
  donut/bar) above the existing table/list detail, not replacing it
  (see Corrections below); Scorecard's Key-Result-by-status donut was
  replaced (not supplemented) by a weighting treemap on 2026-09-20 —
  see that section; Check-in Compliance additionally has a per-person
  GitHub-style cadence heatmap (2026-09-18); Alignment Map is unchanged
  (tree, by design — see the Backlog note on the visual strategy map,
  still open)
- Cascade level, terminology, scoring rubric, and OKR element
  configuration (Tenant Admin)
- Data export (FR-030) — JSON or a CSV-per-entity zip, Tenant Admin for
  their own tenant, Platform Admin for any tenant (see 2026-09-17 below)
- Audit log — list (paginated) and export (JSON/CSV, date-range),
  Tenant Administrator own tenant, Platform Administrator any/all
  tenants, `AuditLog.jsx` page. As of 2026-09-18, every event also
  carries a human-readable entity label and, for updates, a field-level
  before/after diff (see below) — not just the entity type and a UUID.
- Health check endpoint
- Platform Administrator bootstrap, on-demand, idempotent

## What's explicitly NOT built yet

- Billing integration (flag exists, `billing.mode`, nothing wired to it)
- SSO (flag exists, `auth.sso.enabled`, not implemented)
- Field-level encryption (flag exists, `security.fieldEncryption.enabled`,
  not implemented — no special personal information in scope yet per
  Stage 1, so correctly deferred)
- Cycle-over-cycle trend, Initiative execution status, Reflection digest,
  and Cross-tenant adoption reports (named in the Stage 2 doc, never
  given an API endpoint)
- AI Settings functionality (menu scaffolded per FR-022, flags have no
  effect yet — Phase 2 by design)

## Corrections made this session

- `schema.sql` was missing the `initiative`, `check_in`, and `reflection`
  tables entirely, despite the corresponding services actively querying
  them and the functionality being confirmed live — the fold-back step
  this project's convention requires (migration applied to Neon → folded
  into `schema.sql` → migration file deleted) didn't happen for whichever
  module introduced them. Reconstructed from the three services' own SQL
  and added to this delivery, including RLS. **This was built by reading
  application code, not by inspecting Neon directly — diff it against the
  live database before trusting it as the current-state reference.**
- `ObjectiveDetail.jsx` only exposed renaming an Objective; the backend
  (`updateObjective`) and the API client already supported changing its
  parent (re-parenting within the same cascade level, or detaching). Added
  the missing UI. Moving an Objective to a *different* cascade level is
  still not supported anywhere — open design question, not yet decided.
- This file and `reference.md` were both meaningfully behind the repo —
  see each file's own note on what changed.

## Later the same day: charts added (2026-09-16, second delivery)

Closed the "Chart-based dashboards" backlog item below. Added `recharts`
(dependency, `frontend/package.json`) and a small reusable chart set
under `frontend/src/components/charts/` (`StatCard`, `StatusDonut`,
`StatusBarChart`), themed entirely from `tokens.js`'s existing
`CHART_PALETTE`/`STATUS_META` — no new backend, every chart is computed
client-side from endpoints that already existed (`GET /api/objectives`,
team-progress, checkin-compliance). Dashboard (`/`) rebuilt from a bare
quick-link list into a role-aware analytics view (KPI cards + Objective
status donut for everyone; a team status bar chart added for Manager; a
check-in compliance donut added for TenantAdmin; PlatformAdmin gets a
separate, simpler view since they have no tenant to chart). Scorecard,
Team Progress, and Check-in Compliance each gained a chart summary above
their existing detail. `npm run build` (frontend) and the full backend
`npm test` (347 tests) both pass against this delivery — the first time
this session that's been verified rather than assumed. Alignment Map was
deliberately left untouched — it's a tree, not a chart, and stays its
own backlog item (visual strategy map, below).

## Later the same day, again: hierarchy view + dashboard redesign (2026-09-16, third delivery)

Two changes, prompted by Mark's own comparison of the Objectives list
against the Alignment Map report, and against reference screenshots of
a differently-styled product dashboard:

- **Objectives page** (`/objectives`) now defaults to the same
  collapsible parent/child tree as Alignment Map, with a toggle back to
  the flat table. The tree-building logic was extracted out of
  `AlignmentMap.jsx` into `utils/objectiveTree.js` so both pages use the
  identical algorithm rather than a second copy that could drift.
  `GET /api/objectives` already returned `parentObjectiveId` per row —
  no backend change needed. Titles in the tree view are still links
  through to the edit page; Alignment Map's aren't, and stays that way —
  Objectives is the CRUD entry point, the report isn't.
- **Dashboard redesigned a second time.** The first pass (same day,
  above) used identical boxed stat cards with ALL-CAPS labels for every
  number — the generic "SaaS-card kit" pattern, not a deliberate choice.
  Rebuilt around one hero (an on-track/achieved progress ring paired
  with the status donut, in a single card with its own visual weight —
  a thin brand-gradient top edge, more generous padding) with the
  individual counts demoted to a lighter icon-led metric row beneath it
  rather than competing boxes. New icon set (`components/charts/icons.jsx`)
  is hand-rolled inline SVG, not a new dependency. `npm run build` and
  `npm test` (347) both still pass.

Mark also referenced a set of screenshots from an unrelated consumer
product (an AI fantasy-sports assistant) as a style reference for "high-
end design studio" quality — bespoke mini-illustration per card, a
purple/violet palette. That's a marketing/explainer-page genre (selling
a system to a prospective user) rather than an operational daily-use
dashboard, and the palette was explicitly rejected for WayPoint back
when the brand was set (`reference.md`'s Brand section: "if anything
still looks purple, it's stale"). What was actually borrowed from those
references — real visual hierarchy, purposeful icon-led colour instead
of decoration, one clear hero rather than uniform boxes — without the
custom bespoke illustration-per-metric, which is a different scale of
design investment than an internal KPI dashboard justifies. Flag if
that trade-off read is wrong.

## 2026-09-17: health card removed, sparklines, cascade-level move, Data export, Audit log export

- **Dashboard's "API health" card removed.** Leftover Stage 3 scaffold
  content — a bare "database reachable" chip gave no role something to
  act on. `/api/health` itself is untouched (still matters for FR-006
  uptime monitoring); only the landing-page UI card is gone.
- **Scorecard's Key Results show a confidence-trend sparkline** next to
  each title, from `kr.confidenceTrend` data that was already being
  fetched and previously only listed as plain text. New hand-rolled
  `components/charts/Sparkline.jsx` (not recharts — too small a space
  for a full chart's chrome to pay for itself).
- **Objective cascade-level move built** — previously open, resolved:
  yes, movable. `updateObjective` now accepts `cascadeLevelId`, blocked
  while the Objective has children (named in the error — no
  auto-cascading onto descendants), with the parent link auto-detaching
  rather than erroring if it no longer fits the new level and wasn't
  re-specified in the same call. `ObjectiveDetail.jsx`'s edit form has a
  level dropdown with a proactive children warning. Mid-build, an
  unnecessary refactor of the FR-023 cycle-check query broke two
  existing tests — caught by running the suite, reverted, rebuilt the
  new behaviour around the original implementation with a try/catch
  instead. 5 new tests.
- **Data export (FR-030) built** — `exportService.js` (six entities,
  explicit column lists matched against `schema.sql`, not `SELECT *`,
  so a future schema drift breaks the export loudly instead of silently
  changing its shape) plus a dependency-free `csv.js` writer, reused by
  audit log export below. `GET /api/tenants/:id/export?format=json|csv`
  — TenantAdmin own tenant, PlatformAdmin any tenant, audit-logged per
  export. CSV is a zip via `jszip` (six entities, six shapes — one CSV
  isn't coherent). UI: an export section on OKR Settings (TenantAdmin)
  and per-row buttons on Tenants Admin (PlatformAdmin).
  `res.send()`/`res.setHeader()` for a binary/text body — the first use
  of either anywhere in this codebase (every other route uses
  `res.json()`) — confirmed correct against Vercel's own Node.js
  Functions docs, since nothing here can deploy-test it directly.
- **Audit log export (FR-031) built**, and with it the read side that
  never existed at all before today — confirmed by grep, not assumed:
  `auditService.js` only exported `recordAuditEvent` (write-only),
  called from 7 routers, so events were being recorded and never read
  back, for any role. Added `listAuditEvents` (keyset-paginated by a
  `before` timestamp cursor) and `exportAuditEvents` (date-range, no
  limit). RLS does all the tenant scoping — `withTenantContext(id, …)`
  for one tenant, `withPlatformContext(…)` for every tenant — so neither
  function takes a tenantId parameter itself. New
  `GET /api/audit-log` and `GET /api/audit-log/export?format=json|csv`,
  same TenantAdmin-own/PlatformAdmin-any split as Data export, plus a
  PlatformAdmin-only `?tenantId=` filter for "one tenant" versus "every
  tenant." Folded into `tenants-router.js` via a `?resource=audit-log`
  rewrite in `vercel.json` rather than a new top-level router file —
  this project has hit Vercel's 12-function Hobby ceiling before (see
  app-builder skill's own note on it), and the count was already at 10.
  New `AuditLog.jsx` page (TenantAdmin and PlatformAdmin only, nav link
  for both) with cursor-based "Load more" and the same export controls.
  Exporting the audit log is itself now an audited action.
- `jszip` needed adding as a dependency in **both**
  `frontend/package.json` (the app) **and** the root `package.json`
  (test-only) — a test file importing a package directly resolves it
  relative to its own location, outside `frontend/`, so root
  `node_modules` needs its own copy even though the app's runtime copy
  lives in `frontend/node_modules`. Same reason `pg` was already a root
  devDependency despite no service file importing it directly. Noted in
  `reference.md`.
- Still open, raised in the same conversation: donut/bar/ring charts are
  functional but conventional. Confirmed build order for next: calendar
  heatmap (Check-in Compliance — cadence over the Cycle, GitHub-style),
  then a treemap sized by Key Result weighting (FR-016, captured today
  but never visualised), then a sunburst for the cascade (the more
  visually ambitious version of the "visual strategy map" backlog item
  below). None built yet.
- `npm run build` and the full `npm test` (393, up from 347 at the start
  of today) both pass.

## 2026-09-18: audit log detail — entity labels and field-level diffs

Mark's ask, prompted by looking at the real deployed Audit Log: the
Entity column showed a bare UUID ("Objective (124edc9f-...)"), useless
without knowing what that Objective was called, and no indication of
*what* changed on an update — referencing MedBroker's audit log as the
comparison point. I don't have visibility into MedBroker's specific
implementation from this project's session (project-scoped memory), so
this is an independently-designed equivalent, not a copy — flag it if
it doesn't match what Mark had in mind.

- **Schema**: `audit_log` gained `entity_label` (text) and `changes`
  (jsonb, `[{field, from, to}]`). Both are snapshots taken *at the time
  of the action* — an Objective's title here is what it was called when
  the action happened, immune to a later rename or delete, deliberately
  not a live join back to the entity table. Migration written to
  `db/migrations/2026-09-18-audit-log-detail.sql` (apply once against
  Neon, then delete per this project's convention) and folded into
  `schema.sql` already.
- **`diffFields(before, after, fields)`** added to `auditService.js` —
  one shared helper so "what counts as changed" is decided once, not
  wherever each of the ~27 call sites happened to need it. Caught a real
  bug before it shipped: a naive `!==` comparison calls two different
  array/object instances "changed" even when their contents are
  identical (e.g. cascade level labels), which would have made *every*
  save of an unrelated field show a false-positive diff. Fixed to
  compare by serialised value; covered by dedicated tests.
- **All ~27 `recordAuditEvent` call sites updated** — every one across
  `auth-router.js`, `flags-router.js`, `key-results-router.js`,
  `objectives-router.js`, `settings-router.js`, `tenants-router.js`, and
  `users-router.js` now passes a human-readable `entityLabel`. Update
  actions (Objective, Key Result, Initiative, feature flags, cascade
  levels, scoring rubric, cadences, OKR element toggles, terminology,
  user role, user manager) additionally pass a `changes` diff, fetching
  a cheap "before" read where the service function doesn't already
  expose one — a known, accepted inefficiency (one extra query on an
  admin/settings action, not a hot path) rather than changing tested
  service internals to return before-state too. `user.manager_changed`
  specifically resolves manager IDs to real names for the diff, not raw
  UUIDs — showing a UUID there would have defeated the entire point of
  this feature for exactly the field most worth showing a name for.
- **CSV/JSON export and the `AuditLog.jsx` table both updated** to show
  the label and a readable "field: from → to" changes list — CSV
  flattens the `changes` array into one string per row (a raw array
  would render as `[object Object]` in a spreadsheet).
- Real breakage caught by actually running the suite, not assumed
  fixed: extending ~27 call sites broke **17 existing tests** across 4
  files, for two distinct reasons — (1) five router files now import
  `diffFields`, but those test files' `auditService.js` mocks only
  stubbed `recordAuditEvent`, so the import came back `undefined` and
  calling it threw; (2) two test files mock `withTenantContext` with a
  bare `client.query` with no default return value, and the new
  "before" fetches call that raw client directly — destructuring `rows`
  off an unmocked call's `undefined` result threw. Both fixed at the
  mock level, not by weakening what the code does. 14 new tests added
  specifically for the new logic (`diffFields`'s edge cases including
  the array-comparison bug, `recordAuditEvent`'s new fields, the CSV
  flattening, and two representative router-level integrations —
  Objective title changes and the manager-name resolution).
- `npm run build` and the full `npm test` (407, up from 393) both pass.

## Later the same day: calendar heatmap for Check-in Compliance (first of the three chart candidates)

- **`getCheckinCompliance` (reportingService.js) extended** with a second
  query returning per-day Check-in counts per employee
  (`checkInsByDate: [{date, count}]`) — the existing query only ever
  computed a boolean `hasCheckedIn` per Key Result, which can't show
  cadence (whether checking in is a steady habit or a last-week
  scramble), only whether it happened at all. Kept as a separate query
  rather than folded into the existing one — that one groups by Key
  Result, this groups by day, and forcing both into one query would
  have meant an awkward double-aggregation.
- **New `components/charts/CalendarHeatmap.jsx`** — a real
  GitHub-contributions-style grid (weeks as columns, days-of-week as
  rows via CSS Grid's `grid-auto-flow: column`, not just a wrapped row
  of cells), one per person on the Check-in Compliance report, above
  the existing ✓/✗ Key Result list rather than replacing it — the two
  answer different questions. Future days (the Cycle hasn't reached
  them yet) render as a dashed empty outline, deliberately distinct
  from a past day with no Check-in, since those mean different things.
  Verified the date/padding math with a standalone trace before
  trusting it, not just "the build didn't fail" — this codebase has no
  frontend component test harness to catch a date-logic bug otherwise.
- Existing `reportingService.test.js` had one test break from the new
  second query (a sequential mock missing its third `mockResolvedValueOnce`)
  — fixed, plus 2 new tests added for the day-grouping logic itself.
- `npm run build` and `npm test` (409, up from 407) both pass.
- Next: weighting treemap, then the cascade sunburst, per the confirmed
  order — not started yet.

## 2026-09-20: Check-in discoverability fixed, weighting treemap (second of three)

Prompted by Mark's report that Check-in Compliance's heatmap wasn't
visible and Check-ins seemed to not exist at all. Root cause, confirmed
before changing anything: neither was a bug. Mark was testing signed in
as Fred Steinberg (Manager), and Check-in Compliance has always been
Tenant Administrator only (`Reports.jsx` correctly gates that card on
`isTenantAdmin` — matches the original Stage 2 scope, not something
this week's work changed). The GitHub commit confirmed the delta had
landed. But the report surfaced a real, separate problem worth fixing
on its own merits:

- **Check-in submission was a full extra navigation away from where
  you're most likely to be looking.** Reflections sit right on the
  Objective page; Check-ins required clicking "View" through to a
  separate Key Result page, with nothing on the Objective page hinting
  that's where the actual scoring happens.
- **Fixed**: the Objective page's Key Results table now shows each
  Key Result's last check-in date (or a "No check-ins yet" warning
  chip) directly, plus an inline "Check in" button that expands the
  real submission form in place — no navigation required for the most
  common case. `listKeyResultsForObjective` (keyResultService.js)
  extended with a `lastCheckInAt` correlated subquery, scoped to that
  one query rather than the shared `KEY_RESULT_FIELDS` constant (that
  constant also backs `updateKeyResult`/`createKeyResult`'s `RETURNING`
  clauses, and a correlated subquery there would need re-verifying
  against each statement's own table alias — not worth the risk for a
  field only the list view needs).
- `SubmitCheckInForm` (and `CONFIDENCE_LABELS`) extracted out of
  `KeyResultDetail.jsx` into `components/SubmitCheckInForm.jsx` so both
  pages use the identical form — this is now used in two places, and a
  second copy was exactly the kind of thing that drifts.
- Permission check reused, not reinvented: a Key Result has no owner of
  its own (only `objective_id` — ownership is entirely inherited from
  its Objective), so `objective.canEdit` — already computed and already
  driving the Edit button — is the correct gate for the inline Check-in
  button too, same rule as FR-018 (owner or their Manager).
- 2 new tests for `listKeyResultsForObjective` (previously zero
  coverage existed for that function at all, not just for this change).
- **Weighting treemap built** — `WeightingTreemap.jsx`, recharts'
  native `Treemap` with a custom cell renderer for status colouring
  (fixed fill colours needed a dark text outline rather than a flat
  white, since "Not Started"'s grey doesn't contrast as reliably as the
  danger/warn/success colours do). Replaced the Key-Result-by-status
  donut on Scorecard rather than sitting alongside it — a treemap sized
  by weighting is strictly more informative than a count-based donut
  for the same set of Key Results, and stacking both would have been
  two charts saying overlapping things.
- `npm run build` and `npm test` (411, up from 409) both pass.
- Next: the cascade sunburst, last of the three.

## 2026-09-23: real roll-up bug fixed — this one matters, read it

Mark's own testing (adding/checking in Key Results, watching Objective
status stay "Not Started" regardless) surfaced a genuine bug, not a
misunderstanding — confirmed by reading the code, not assumed.

- **The bug:** `recomputeObjectiveStatus` (scoringService.js) decided
  EITHER children OR own Key Results, never both — an Objective with a
  child Objective scored from that child alone, silently discarding
  Check-ins submitted directly on its own Key Results. This was a known,
  explicitly-flagged ambiguity from when this module was first built
  ("an Objective can have both children and its own Key Results... flag
  if that's wrong" — it was wrong). Mark's real data hit it exactly: a
  Company-level Objective with two directly checked-in Key Results
  (Achieved, On Track) AND a Division-level child stayed "Not Started"
  because the child hadn't been scored yet, and the code never looked
  at the Company objective's own Key Results once it saw it had a child.
- **Fixed:** own Key Results are weighted-averaged among themselves
  first (unchanged), then treated as one more equally-weighted item
  alongside each child Objective, rather than the two being mutually
  exclusive. 12 tests rewritten to match the corrected query order and
  behaviour, including a new test reproducing the exact bug shape.
- **This does NOT retroactively fix already-stored statuses.** Every
  Objective currently showing a stale status in the live database will
  keep showing it until something re-triggers `recomputeObjectiveStatus`
  for it — submitting any new Check-in on an affected Key Result cascades
  correctly under the fixed logic and will correct that Objective (and
  everything above it) as a side effect. There is no bulk "recompute
  everything" tool yet — say if you want one; it wasn't built here
  because a full audit of every place that could need it wasn't in
  scope for this pass.
- **Check-in submitter was genuinely missing, not just under-displayed**
  — `submitted_by_id` was already stored and already selected by
  `listCheckInsForKeyResult`, but never joined to a name, and the
  frontend never rendered even the raw ID. Fixed: the list query now
  joins `user_account` for the submitter's name, shown on every
  Check-in row. Matters specifically because a Manager can submit on a
  report's Key Result (FR-018) — without this, there was no way to tell
  whose check-in you were looking at.
- **On whether a Manager should be able to update a direct report's Key
  Result at all** — yes, by design: FR-018 explicitly allows "an
  Objective or Key Result owner, and where applicable their Manager."
  The permission check itself is correct (verified in code — owner OR
  owner's Manager, nothing looser). What I can't verify from here is
  whether Fred is actually *configured* as Joe's manager in the live
  tenant data — worth a quick look at Users Admin if you want to confirm
  that specific relationship is intentional, since the rule being
  correct doesn't guarantee the org chart data matches what you meant
  to set up.
- `npm run build` and `npm test` (415, up from 411) both pass.

## Backlog — considered against Perdoo/ClickUp, not yet scoped

Raised when comparing WayPoint against Perdoo's UI (screenshots reviewed
2026-09-16) and, more loosely, ClickUp's Goals feature. None of these have
an FR yet — each would need a proper Stage 1/2-style scoping pass, not a
silent addition, before being built:

- **Standalone KPI/metric entity** — a trackable metric independent of
  any Objective (Perdoo's Boards; ClickUp's Goal Folders/Targets), with
  its own time series and target, as distinct from Key Result (which
  always belongs to exactly one Objective and has a single rubric-level
  status, not a time series). Not in the 16-entity data model at all.
  Biggest genuine capability gap of everything reviewed.
- **Meetings / 1:1 module** — agendas, talking points, action items,
  with goal/report data pulled in. No FR, no entity, never scoped.
  Materially different feature category from OKR tracking, not a
  natural extension of it.
- **Visual strategy map** — the Alignment Map report is functionally
  equivalent (parent-child cascade, collapse/expand for deep trees) but
  renders as an indented list, not a box-and-connector canvas. A
  presentation-layer enhancement on data already computed, not a new
  capability. (Charts are now built — see above — this is specifically
  about the cascade tree itself, which is still a list.)
- **Composite team "business review" view** — trend + roll-up + freeform
  wins/observations in one page. Partial overlap with Team Progress +
  Reflections; not currently its own FR.
- **AI OKR coaching** (tightening objective wording, suggesting
  outcome-based Key Results) — already anticipated by FR-022/section 8
  as a named future capability behind the AI Settings flag. Not a new
  idea, just not built.

## Next immediate step

Apply `db/migrations/2026-09-18-audit-log-detail.sql` against Neon (then
delete it from the repo per convention) if that hasn't happened yet —
nothing shows entity labels or diffs until that column exists live.
Cascade sunburst next, the last of the three chart candidates. Also
still open: confirm this delivery (inline Check-in on the Objective
page, the weighting treemap) looks right in a real browser, signed in
as an actual Tenant Administrator this time so Check-in Compliance and
its heatmap are reachable — everything here was verified by
`npm run build`/`npm test` passing, not by a real deploy.

## Open items, not yet resolved

- Trademark/domain check on "WayPoint" — flagged early in Stage 1, never
  externally confirmed.
- No second database region or Azure migration — deliberately deferred.
- Per-module dev-team review isn't leaving a durable record in the repo
  (see "Where things actually stand" above) — worth deciding how that
  should be tracked going forward so this kind of drift is caught sooner.

## For a new chat picking this up

Read `reference.md` first (architecture, decisions, structure), then
this file. The repo itself (`github.com/mrdutoit/WayPoint`,
`waypoint-v1` folder) is the actual source of truth for what's built —
these two files are a map, not a substitute for reading the code when
precision matters.
