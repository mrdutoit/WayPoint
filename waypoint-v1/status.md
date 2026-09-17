# WayPoint — Status

Current state and next steps. This is the part that goes stale — check
dates and re-verify against the actual repo/deployment before trusting
anything here, especially if it's been a while. For the stable
architecture description, see `reference.md` alongside this file.

**Last updated:** 2026-09-16, reconstructed directly from the GitHub repo
(`mrdutoit/WayPoint`, `waypoint-v1`) rather than from a session log — the
previous version of this file said Stage 4 hadn't started, which the repo
contradicts (Modules 1–3 and part of Module 6 are built and, per the
screenshots reviewed this session, working in production). Treat this
version as more trustworthy than its predecessor, but still verify against
the repo yourself before relying on it — that's true of every version of
this file, not just this one.

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
  matching FR-015), re-parenting (edit — see Corrections below)
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
- Health check endpoint
- Platform Administrator bootstrap, on-demand, idempotent

## What's explicitly NOT built yet

- Billing integration (flag exists, `billing.mode`, nothing wired to it)
- SSO (flag exists, `auth.sso.enabled`, not implemented)
- Field-level encryption (flag exists, `security.fieldEncryption.enabled`,
  not implemented — no special personal information in scope yet per
  Stage 1, so correctly deferred)
- Data export / audit log export (FR-030/FR-031)
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

Confirm the charts delivery (Dashboard, Scorecard, Team Progress,
Check-in Compliance) looks right in a real browser — this was verified
by `npm run build`/`npm test` passing, not by visual review, so the
first real check is Mark's own eyes on it. Also confirm which of the
earlier corrections (Objective re-parenting UI, `schema.sql` fold-back)
are acceptable as delivered, and decide which backlog item — if any —
gets a proper FR pass next (visual strategy map is the natural
follow-on to the charts work, if that direction continues).

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
