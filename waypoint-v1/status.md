# WayPoint — Status

Current state and next steps. This is the part that goes stale — check
dates and re-verify against the actual repo/deployment before trusting
anything here, especially if it's been a while. For the stable
architecture description, see `reference.md` alongside this file.

**Last updated:** 2026-09-17. Originally reconstructed 2026-09-16 directly
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
- Check-in submission driving Key Result and Objective status roll-up
- Initiatives and Reflections against Key Results/Objectives
- Reporting: Scorecard, Team Progress, Alignment Map (collapsible tree,
  not a visual canvas), Check-in Compliance — Dashboard, Scorecard, Team
  Progress, and Check-in Compliance now lead with a Recharts-based chart
  (status donut/bar) above the existing table/list detail, not replacing
  it (see Corrections below); Alignment Map is unchanged (tree, by
  design — see the Backlog note on the visual strategy map, still open)
- Cascade level, terminology, scoring rubric, and OKR element
  configuration (Tenant Admin)
- Data export (FR-030) — JSON or a CSV-per-entity zip, Tenant Admin for
  their own tenant, Platform Admin for any tenant (see 2026-09-17 below)
- Health check endpoint
- Platform Administrator bootstrap, on-demand, idempotent

## What's explicitly NOT built yet

- Billing integration (flag exists, `billing.mode`, nothing wired to it)
- SSO (flag exists, `auth.sso.enabled`, not implemented)
- Field-level encryption (flag exists, `security.fieldEncryption.enabled`,
  not implemented — no special personal information in scope yet per
  Stage 1, so correctly deferred)
- Audit log — confirmed 2026-09-17 that this doesn't exist in any form
  yet, not even a page: `auditService.js` only exports
  `recordAuditEvent` (write-only), called from 7 routers, so events are
  being recorded, but nothing reads them back — no list endpoint, no
  export endpoint (FR-031), no page, for any role including
  PlatformAdmin. Next in the build queue.
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

## 2026-09-17: health card removed, sparklines, cascade-level move, Data Export

- **Dashboard's "API health" card removed.** It was leftover Stage 3
  scaffold content — a bare "database reachable" chip doesn't give any
  role (Employee through PlatformAdmin) something to act on, and the
  `/api/health` endpoint itself still exists and still matters for
  FR-006 (actual uptime/monitoring tooling should poll it) — only the
  UI card on the landing page is gone, not the endpoint.
- **Scorecard's Key Results now show a confidence-trend sparkline** next
  to each title. The data (`kr.confidenceTrend`, one point per Check-in)
  was already being fetched and was already in this file — it was just
  rendered as a plain date-sorted text list below, with no way to see a
  trend at a glance. New `components/charts/Sparkline.jsx` — hand-rolled
  SVG, not recharts; at this size (sits inline next to a title) a full
  chart's axes/tooltip chrome would cost more space than it shows.
- Raised in the same conversation: donut/bar/ring charts are functional
  but conventional. Real next candidates, in rough order of how ready
  the data already is:
  - **Calendar heatmap** for Check-in Compliance — cadence over the
    Cycle (who checked in *when*, not just whether), GitHub-contributions
    style. Same `getCheckinCompliance` data, just needs each Check-in's
    date instead of a boolean.
  - **Treemap** sized by Key Result weighting (FR-016), coloured by
    status — weighting is captured today but never visualised anywhere.
  - **Sunburst** for the cascade (Company → Division → Team →
    Individual) — the more visually ambitious version of the "visual
    strategy map" backlog item below, same underlying data as Alignment
    Map. Build order confirmed: heatmap, then treemap, then sunburst.
  None built yet — next up after Data export and Audit log export below.
- **Objective cascade-level move built** — previously an open design
  question, resolved: yes, movable. `updateObjective` now accepts
  `cascadeLevelId`. Blocked outright if the Objective has children
  (named in the error — re-parent or detach them first, no
  auto-cascading onto descendants); the parent link auto-detaches rather
  than errors if it no longer fits the new level and wasn't itself
  re-specified in the same call. Mid-build, an unnecessary refactor of
  the FR-023 cycle-check query broke two existing tests — caught by
  actually running the suite, reverted to the original tested
  implementation, built the new behaviour around it with a try/catch
  instead. 5 new tests added for the new capability.
  `ObjectiveDetail.jsx`'s edit form has a level dropdown now, with a
  proactive warning when children would block the move.
- **Data export (FR-030) built** — `exportService.js` (six entities,
  explicit column lists matched against `schema.sql`, not `SELECT *`,
  so a future schema drift breaks the export loudly instead of silently
  changing its shape) plus a small dependency-free `csv.js` writer,
  reused-ready for audit log export next. New endpoint
  `GET /api/tenants/:id/export?format=json|csv` in `tenants-router.js` —
  TenantAdmin for their own tenant, PlatformAdmin for any tenant,
  audit-logged on every export. CSV format is a zip (one file per
  entity, via `jszip` — the six entities don't share one table shape,
  so a single CSV isn't a coherent option). UI: an export section on OKR
  Settings (TenantAdmin) and per-row export buttons on Tenants Admin
  (PlatformAdmin), both triggering a real browser download.
  `res.send()`/`res.setHeader()` for a binary/text body is the one
  mechanism in this delivery with no prior use elsewhere in the
  codebase (every other route uses `res.json()`) — confirmed correct
  against Vercel's own Node.js Functions documentation, since nothing
  in this environment can deploy-test it directly; still worth being
  the first thing checked after deploying.
- `jszip` had to be added as a dependency in **both**
  `frontend/package.json` (the app itself) **and** the root
  `package.json` (test-only) — a test file that imports a package
  directly resolves it relative to the test file's own location, which
  is outside `frontend/`, so root `node_modules` needs its own copy even
  though the app's real runtime copy lives in `frontend/node_modules`.
  Same reason `pg` was already a root devDependency despite no service
  file importing it directly. Noted in `reference.md` so this doesn't
  need rediscovering.
- `npm run build` and the full `npm test` (372, up from 347) both pass.

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

Confirmed order: Audit log export (FR-031) next — this needs the read
side built from scratch (no list/query capability exists at all yet,
see "What's explicitly NOT built yet" above), not just an export
wrapper the way Data export was. After that, the three chart
candidates in order: calendar heatmap, weighting treemap, cascade
sunburst. Also still open: confirm the whole 2026-09-17 delivery looks
right in a real browser and that the export downloads actually work end
to end against live Neon/Vercel — everything here was verified by
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
