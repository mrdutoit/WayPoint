# WayPoint — Status

Current state and next steps. This is the part that goes stale — check
dates and re-verify against the actual repo/deployment before trusting
anything here, especially if it's been a while. For the stable
architecture description, see `reference.md` alongside this file.

**Last updated:** 2026-09-25 (second entry — sunburst built, design
pass complete across every page). Originally reconstructed 2026-09-16 directly
from the GitHub repo (`mrdutoit/WayPoint`, `waypoint-v1`) rather than from a
session log — the previous version of this file said Stage 4 hadn't
started, which the repo contradicted. This file was condensed on
2026-09-24 — the day-by-day narrative from 2026-09-16 through
2026-09-20 was folded into a short timeline (see History below) once it
stopped being anything other than history; nothing was removed, just
compressed. Still verify against the repo yourself before relying on
this — that's true of every version of this file, not just this one.

## Where things actually stand

- **Stage 1 (Requirements):** Complete.
- **Stage 2 (Architecture & Design):** Complete. Requirements and
  Architecture document is at v0.3, Stage 2 doc at v0.4.
- **Stage 3 (Scaffold):** Complete.
- **Stage 4 (Full build, module by module):**
  - Module 1 (Auth & user management): built — login, tenant/user
    provisioning, password reset/change, role guards, session
    persistence across a page refresh (2026-09-23).
  - Module 2 (Core entity CRUD — Objective, Key Result): built — list,
    detail, create, edit. No delete endpoint for either, matching the
    Stage 2 API design table, which never specified one — OKR history
    isn't meant to be deletable.
  - Module 3 (Secondary entities — Initiative, Check-in, Reflection):
    built — all three have working service/router/frontend code and
    are confirmed live in production.
  - Module 4 (Primary workflow — Check-in submission driving the
    Objective/Key Result score roll-up, FR-019): built —
    `scoringService.js`, called from `checkInService.js`, and (as of
    2026-09-23) also from `objectiveService.js`/`keyResultService.js`
    wherever weighting or cascade position changes. Roll-up rule revised
    2026-09-24 (completion gate — see below).
  - Module 5 (Integrations): none identified in Stage 1 scope — N/A.
  - Module 6 (Reporting & dashboards): partially built. Four of the
    eight report types listed in the Stage 2 doc's section 5 are built
    (Scorecard, Team Progress, Alignment Map, Check-in Compliance) —
    matching the four the Stage 2 API design table actually specified.
    Cycle-over-cycle trend, Initiative execution status, Reflection
    digest, and Cross-tenant adoption are named in the doc but were
    never given an endpoint in the API table, so they're correctly
    unbuilt, not a gap against what was approved.
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

- Sign-in (standalone auth, Argon2id + JWT), tenant/user provisioning,
  and — since 2026-09-23 — a session that actually survives a page
  refresh (it didn't before; see History)
- Row-Level Security tenant isolation, including `initiative`,
  `check_in`, and `reflection`
- Feature flags: read + admin update, platform-wide
- Objective/Key Result creation, cascade linking (optional at creation,
  matching FR-015), re-parenting and cascade-level moves (edit), and a
  collapsible hierarchy view on the Objectives list itself (toggle
  against the existing flat table), matching Alignment Map's tree
- Check-in submission driving Key Result and Objective status roll-up —
  submittable either on the Key Result's own page or inline right on
  the Objective page's Key Results table (last check-in date/warning
  chip shown per row, "Check in" expands the form in place). The
  roll-up itself was fixed 2026-09-23 (an Objective with both its own
  Key Results and a child Objective was silently ignoring the former —
  see History, this one is worth actually reading) and now also
  triggers automatically on a weighting change or a re-parent/level
  move, not just a new Check-in.
- Initiatives and Reflections against Key Results/Objectives
- Reporting: Scorecard, Team Progress, Alignment Map (strategy canvas),
  Check-in Compliance — all four and the Reports hub redesigned
  2026-09-24 in the Dashboard's chart language — Dashboard, Team Progress,
  and Check-in Compliance lead with a Recharts-based chart above the
  existing table/list detail; Scorecard leads with a weighting-sized
  treemap instead of a status donut; Check-in Compliance additionally
  has a per-person GitHub-style cadence heatmap; Alignment Map is
  unchanged (tree, by design — see the Backlog note on the visual
  strategy map, still open)
- Cascade level, terminology, scoring rubric, and OKR element
  configuration (Tenant Admin)
- Data export (FR-030) — JSON or a CSV-per-entity zip, Tenant Admin for
  their own tenant, Platform Admin for any tenant
- Audit log — list (paginated) and export (JSON/CSV, date-range),
  Tenant Administrator own tenant, Platform Administrator any/all
  tenants. Every event carries a human-readable entity label and, for
  updates, a field-level before/after diff — not just the entity type
  and a UUID.
- Health check endpoint (no longer a Dashboard UI card, which was dead
  Stage 3 leftover — the endpoint itself is untouched)
- Platform Administrator bootstrap, on-demand, idempotent
- Dashboard rebuilt from scratch 2026-09-24 around a "course line" hero
  (see the 2026-09-24 redesign entry below) — replaces both earlier
  passes, which Mark rejected as not studio-grade
- Every page wrapped in an error boundary — a render crash now shows a
  readable error with the nav intact, never a blank white screen

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


## History — condensed (2026-09-16 through 2026-09-20)

Full narrative detail for this stretch has been folded into the
sections above (what's built, what's missing, the backlog) — kept here
as a compact timeline, not the day-by-day account these entries used
to be. Anything from this period still worth actively tracking already
has its own line under "Open items" or "Next immediate step" below.

- **2026-09-16:** Objective re-parenting UI exposed (backend already
  supported it, only the form was missing it). `schema.sql` corrected
  to match the live database after it had silently drifted — missing
  `check_in`/`initiative`/`reflection` entirely despite those tables
  being live in production — and `reference.md`/`status.md` themselves
  corrected after going stale the same way. Root cause fixed in the
  app-builder skill itself, not just patched this once: the per-module
  delivery checklist didn't explicitly require folding a migration
  into `schema.sql` or checking whether these two docs needed updating,
  so a module could satisfy every other item on the checklist and
  still silently skip both. Recharts added as a dependency; Dashboard
  rebuilt into a real analytics view with its first chart pass;
  hierarchy/tree view added to the Objectives list, sharing its
  tree-building logic with Alignment Map rather than a second copy.
- **2026-09-17:** API health card removed from the Dashboard (dead
  Stage 3 leftover — the endpoint itself stayed). Scorecard gained
  confidence-trend sparklines. Objective cascade-level moves built.
  Data export (FR-030) and Audit log export (FR-031, including the
  read side that never existed before — only the write side did) both
  built.
- **2026-09-18:** Audit log entries gained human-readable labels and
  field-level before/after diffs across all ~27 places the app records
  one — previously just a bare entity type and a UUID. Calendar
  heatmap added to Check-in Compliance.
- **2026-09-20:** Check-in submission moved inline onto the Objective
  page (previously a full extra navigation to the Key Result page,
  with nothing on the Objective page hinting that's where scoring
  actually happens). Scorecard's status donut replaced with a
  weighting-sized treemap.

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
  everything" tool (see the same day's second entry below for why not).
- **Check-in submitter was genuinely missing, not just under-displayed**
  — `submitted_by_id` was already stored and already selected by
  `listCheckInsForKeyResult`, but never joined to a name, and the
  frontend never rendered even the raw ID. Fixed: the list query now
  joins `user_account` for the submitter's name, shown on every
  Check-in row (spacing on that line corrected again 2026-09-24 — see
  below).
- **On whether a Manager should be able to update a direct report's Key
  Result at all** — yes, by design: FR-018 explicitly allows "an
  Objective or Key Result owner, and where applicable their Manager."
  The permission check itself is correct (verified in code — owner OR
  owner's Manager, nothing looser). What I can't verify from here is
  whether Fred is actually *configured* as Joe's manager in the live
  tenant data — worth a quick look at Users Admin if you want to confirm
  that specific relationship is intentional.
- `npm run build` and `npm test` (415, up from 411) both pass.

## Later the same day: session persistence fixed, roll-up triggers closed at the source

Mark reported that hitting browser refresh silently logged him out —
confirmed as a real, root-cause bug, not a misunderstanding, and fixed:

- **The bug:** the JWT lived only in a plain in-memory variable
  (`let _token = null` in `api.js`), and `RoleContext.jsx`'s `user`
  state started from `null` on every mount with nothing anywhere
  reading a saved session back. Any full page reload wiped both.
- **Fixed:** the token now persists to `localStorage` (wrapped in
  try/catch — some browser contexts, e.g. strict privacy modes, can
  throw on storage access; the session just won't survive a refresh in
  that case rather than crashing the app) and is restored at module
  load. `RoleContext` reconstructs `user` from the stored token on
  mount, checking the JWT's own `exp` claim and discarding a stale
  token rather than trying to use it. email/firstName/lastName aren't
  in the JWT payload (only sub/tenantId/role are signed) — those get
  filled in by the same `GET /api/me` enrichment effect that already
  ran after a fresh login, no new backend endpoint needed.
- **Second bug found along the way:** "Sign out" only ever called
  `setUser(null)` — it never actually cleared the token. Fixed in the
  same pass; leaving it would have partially undermined the fix above.
- Extracted the JWT-payload-decoding logic (previously duplicated only
  in `Login.jsx`) into a new shared `utils/jwt.js`, with real unit
  tests — 5 new tests, not just "the build passed."
- **Neither of these was a deliberate choice, on reflection asked for
  directly (2026-09-24) — worth stating plainly rather than leaving
  implied:** both were unexamined gaps carried from the original
  scaffold, not caught earlier because this session's verification has
  been `npm run build`/`npm test` passing, which cannot catch a bug
  that only exists in the interaction between two pieces of browser
  state (a refresh, a sign-out click) — this codebase has no frontend
  component test harness to catch that class of bug automatically.
  That gap is real and still open, not resolved by this fix.

Separately, on the "should there be a manual recompute button"
question — investigated properly rather than answered from a gut call.
Found two more real, recurring places (not just the one-time bug
above) where a stored Objective status could go stale without any new
Check-in ever happening:

- **Editing a Key Result's weighting** after Check-ins already exist —
  `updateKeyResult` never triggered a recompute, so the Objective's
  cached status kept reflecting the old weighting.
- **Re-parenting an Objective, or moving its cascade level** —
  `updateObjective` never triggered a recompute either. Both the OLD
  parent (which just lost a branch) and the NEW parent (which just
  gained one) needed their ancestor chains recomputed; the Objective
  being moved does NOT need its own status recomputed, since roll-up
  only flows child → parent.

Both fixed the same way Check-in submission already works: the
mutation itself now calls `recomputeObjectiveStatus` inline, in the
same transaction, only when the value that actually feeds scoring
changed. No manual button built — closing the gap at the source avoids
the class of bug entirely rather than giving someone a workaround to
remember to click.

One related gap found but deliberately NOT fixed this pass: renaming a
tenant's scoring rubric level label can also leave old statuses
referencing a since-renamed label until their next recompute. Lower
frequency — renaming a rubric level is mostly a setup-time action, not
a routine one — so flagged under Open Items rather than fixed silently.

3 test files fixed for the new query sequences these changes
introduced, plus 2 new tests confirming the new triggers fire only
when they should. `npm run build` and `npm test` (421, up from 415)
both pass.

## 2026-09-24: Dashboard design pass, Check-in row spacing fixed

- **Dashboard given real materiality, not just structure.** The
  2026-09-16 pass fixed the *hierarchy* problem (one hero instead of
  identical boxes) but the result still read flat — same card
  treatment everywhere, nothing interactive, no depth. This pass adds:
  a soft radial glow behind the hero ring (`color-mix` over the brand
  colour, not a flat card), a real hover response on every clickable
  card via a new `.wp-lift` utility in `index.css` (transform-only,
  deliberately — every card already sets its own box-shadow inline via
  `s.card` in `tokens.js`, and an inline style always beats a class for
  the same property regardless of CSS specificity, so a hover effect
  layered on top of an inline-styled system has to use a property
  nothing inline already controls), and quick-links reworked to share
  the same icon-led visual language as the stat row above them instead
  of being a visually separate list. Two new icons added
  (`ClipboardIcon`, `SitemapIcon`) for Scorecard/Alignment Map, in the
  same minimal stroke style as the existing set.
- **Check-in row spacing fixed** — the submitter name (added
  2026-09-23) was prefixed with "— ", which stacked on top of the
  row's existing flex `gap` and read as an inconsistent double-space
  next to the timestamp. Removed the dash; the existing gap now spaces
  every element in the row uniformly.
- Objective Detail was the originally-proposed pilot for a wider design
  pass; Dashboard was built instead, on explicit instruction. Objective
  Detail (and the rest of the app — Objectives list, Key Result Detail,
  Settings, Users, Tenants) has not had this treatment yet.
- `npm run build` and `npm test` (421) both pass.

## 2026-09-24 (later): Dashboard redesign, completion gate, Scorecard crash

Supersedes the Dashboard pass recorded in the entry above — Mark
rejected it outright ("just adding a shadow behind the graphs is not
high-end"), and he was right: it restyled the same card-and-donut
layout rather than rethinking it.

- **Reports "missing menu items" — clarified, not a bug.** Neither of
  the last two report deliveries added a menu item. The heatmap is
  inside Check-in Compliance (TenantAdmin only — Mark was testing as
  Fred, a Manager); the treemap is inside Scorecard, which was crashing
  (next bullet). An earlier explanation attributed this to missing
  Check-ins; that was wrong.
- **Blank Scorecard page — root cause fixed.** Recharts' `Treemap` calls
  its `content` renderer for the ROOT node too (depth 0, no `name`);
  `WeightingTreemap`'s cell read `name.length` unconditionally and threw.
  With no error boundary anywhere, one throw unmounted the whole app.
  Reproduced in a headless browser against the old file before fixing
  (`TypeError: Cannot read properties of undefined (reading 'length')`),
  confirmed rendering after. Cell now renders leaves only.
- **New `components/ErrorBoundary.jsx`**, wrapped around page content in
  `App.jsx`'s `Shell`, keyed by pathname so navigating away clears it.
  Verified it catches the original crash with the nav still usable.
- **Roll-up completion gate (`scoringService.recomputeObjectiveStatus`).**
  Mark's live data: Team "Achieved" over an Individual child that hadn't
  started, rolling "Achieved" up to Division and Company. Cause:
  unscored inputs (Key Result with no Check-in, child "Not Started")
  dropped out of the average entirely, so a parent averaged only what
  had been reported. Now: unscored inputs still don't drag the average
  down (a fresh Cycle would otherwise read Off Track on day one), but
  the rubric's TOP level is a completion state — reachable only when
  every input is scored and every input is itself at the top level;
  otherwise capped one level below ("On Track"). Own Key Results query
  switched to `LEFT JOIN LATERAL` so un-checked-in Key Results count as
  inputs.
- **Stored statuses need a one-off repair.** New
  `scoringService.recomputeTenantStatuses` (every Key Result, then every
  leaf Objective cascading upward), exposed as
  `GET /api/admin/recompute-statuses` on `admin-router.js` behind the
  same `BOOTSTRAP_SECRET` gate as bootstrap, and a **"Recompute all OKR
  statuses"** button in `tools/bootstrap-admin.html`. Idempotent. Also
  the manual remedy for the rubric-label-rename staleness (Open items).
- **Dashboard rebuilt** (`pages/Dashboard.jsx` + new `pages/dashboard.css`,
  plain CSS for hover/media queries/one keyframed moment). Concept: the
  Cycle is a passage, each Check-in a waypoint. Hero is a chart panel in
  the logo's navy with the Cycle drawn as a course line in the
  wordmark's cyan-to-blue gradient — sailed course solid, remaining
  dashed, every Check-in plotted where it happened coloured by score, a
  confidence profile above, "Day N of M" headline and a one-sentence
  position summary. Below: "Your objectives" rows with a
  weighting-proportional status strip; "Check in next" queue (never
  checked in first, then 14+ days stale — a fixed, labelled threshold
  since no per-Key-Result schedule exists); "Your team" (Managers);
  "Across the organisation" by cascade level (+ compliance figure for
  TenantAdmin). Hero sets `data-theme="dark"` on itself so tokens
  resolve to on-dark values in either theme. No new endpoints — built on
  scorecard(self), alignmentMap, teamProgress, checkinCompliance.
- **Correctness fix inside the old Dashboard:** its headline used
  `objectivesApi.list()` — every Objective in the tenant, every Cycle —
  while labelling it the caller's own "this Cycle". New version uses the
  caller's own active-Cycle scorecard.
- **"Add check-in" deep link:** `ObjectiveDetail` opens a Key Result's
  inline check-in form when reached via `?checkin=<keyResultId>`.
- **Typography, app-wide:** Instrument Sans for all UI text, Bricolage
  Grotesque for display (`--font-display`), loaded in `index.html`.
  This changes every page's look, not just Dashboard's.
- **New `utils/cycleMath.js`** (day-of-Cycle, positions, month ticks,
  check-in queue ordering) with 10 unit tests — date logic kept out of
  the component precisely because there's no component test harness.
- **Integration suite was silently broken** — both files still read
  `db/migrations/07-initiative-checkin-reflection.sql`, deleted when it
  was folded into `schema.sql` on 2026-09-16, so neither could run at
  all; and one assertion still encoded the pre-2026-09-23 children-only
  roll-up. Neither was noticed because the suite skips without
  `TEST_DATABASE_URL`. Both fixed, one real-Postgres completion-gate
  test added. Run this time against a real local Postgres 16: 31/31.
- **Verification this time went beyond build/test:** every Dashboard
  state (Manager with data, TenantAdmin with no Objectives, no active
  Cycle, dark theme, 390px mobile) and the Scorecard were rendered in a
  headless Chromium against mocked API responses and reviewed as
  screenshots. That harness lives in the sandbox, not the repo.
- `npm run build`, `npm test` (440, up from 421), and the integration
  suite (31) all pass.

## 2026-09-24 (evening): interactive charts, Dashboard charts restored, Scorecard redesign

Mark's review of the redesigned Dashboard: right direction; wanted the
course line interactive, the previous Dashboard's charts kept (not
dropped) and brought up to the same standard, and the Scorecard redone.

- **New chart primitives, `components/viz/`** — hand-built, no Recharts:
  `CourseLine` (extracted from Dashboard), `StatusRing`, `StatusBars`,
  `WeightMap`, `ConfidenceTrail`, shared `Tooltip`. All interactive,
  hover and keyboard focus alike.
- **Course line interaction:** the whole plot is the hover target —
  the pointer snaps to the nearest waypoint (small dots are hard to hit)
  and shows a card with Key Result, Objective, timestamp, score,
  confidence and comment; away from any waypoint a scrub line shows the
  date under the cursor. Waypoints are buttons: Tab reaches each, Enter
  opens its Objective.
- **Dashboard's previous charts restored as an "at a glance" row:** the
  completion ring + status donut + stat row are now one `StatusRing`
  (headline % in the centre, every count in the legend, hover isolates a
  status); the team key result bar chart is `StatusBars`, plus a
  personal key-result distribution. Scoped to the caller's own data
  (Managers get Team; others get an Organisation ring) — the old ones
  were tenant-wide.
- **Scorecard rebuilt** in the Dashboard's language: navy hero naming
  the person (avatar, name) with their course line; at-a-glance row
  (Objectives ring, Key Results bars, a Rhythm panel — check-in count,
  last check-in, average current confidence); then per Objective a
  `WeightMap` and a row per Key Result with share of score, latest
  comment, `ConfidenceTrail`, and an expandable check-in timeline.
- **Treemap semantics fixed, not just restyled.** The old treemap pooled
  every Key Result from every Objective by raw weighting — but FR-016
  weightings are only normalised within an Objective, so cross-Objective
  sizes were meaningless (the stray green sliver on Joe's scorecard).
  Now one map per Objective, each tile labelled with its share of that
  Objective's score; un-checked-in tiles are hatched so "no data" never
  reads as a status colour.
- **Backend:** `getScorecard` now returns `person` (name, avatar) — the
  page previously never said whose scorecard it was. Folded into the
  existing manager-check query (one lookup, not two); an unknown user
  still returns Forbidden to non-admins (no user enumeration).
- **Removed dead code:** `charts/WeightingTreemap.jsx`,
  `charts/Sparkline.jsx`, `charts/StatCard.jsx` — no remaining users.
  Delete these three from GitHub when applying the delta.
- `Q3 2026` in the hero now set in Instrument Sans — Bricolage's Q has
  a detached tail that read as an underlined "O3".
- Dark theme: weight-map tile labels switch to navy ink (white failed
  contrast on the lighter dark-theme status tints). Mobile: course-line
  month labels hidden under 480px.
- Verified in headless Chromium across Dashboard/Scorecard, light/dark,
  390px, and hover states (waypoint, tile, confidence trail).
  `npm run build`, `npm test` (446), integration against real Postgres
  (31) all pass.

## 2026-09-24 (late): Reports hub, Team Progress, Check-in Compliance, Alignment Map

Mark: the Scorecard/Dashboard direction is right; the older reports and
the Alignment Map were still "very 1-dimensional". All four report pages
and the hub rebuilt; Recharts and `components/charts/` removed.

- **Alignment Map → strategy canvas** on the navy panel: one column per
  cascade level, a card per Objective (status, title, owner), curved
  connectors coloured by the child's status. Hover or focus a card and
  its whole lineage lights (everything it rolls into and everything
  feeding it); the rest dims. Per-card collapse (Sam's Stage 2 review
  requirement) plus Expand all / Top level only; maps over 40 Objectives
  open collapsed below level two. Cards size to the panel so a four-level
  cascade fits without scrolling on desktop; narrower screens scroll.
  Layout is `utils/strategyLayout.js` (columns by cascade LEVEL, not tree
  depth; leaves first, parents centred), 5 unit tests. Above it: status
  ring, an **Alignment** figure (share of below-top-level Objectives
  linked to a parent, listing the unlinked ones) and status by level.
  Closes the backlog's "visual strategy map" item.
- **Team Progress:** navy panel with one course lane per direct report
  (`Lanes` — every Check-in where it happened, coloured by score, detail
  on hover, shared month/today axis); glance row (team Objectives ring,
  team Key Results bars, "Where to look" counts); then per person —
  riskiest first, server risk order kept — a cadence strip and their Key
  Results with confidence, last check-in (overdue flagged) and status.
- **Open question 3 settled by building it:** Managers now get the
  check-in cadence for their own direct reports. `getTeamProgress`
  returns `checkIns` (this Cycle's Check-ins on direct reports' Key
  Results, with score and comment) — no new exposure, since a Manager
  already sees exactly this on each report's Scorecard. Rows also gained
  `employeeAvatarOption`, `objectiveStatus`, `weighting`, `lastCheckInAt`.
  Query verified against real Postgres (integration suite).
- **Check-in Compliance:** coverage ring (checked in / not yet), People
  and Volume panels, then one row per person, least covered first:
  ratio + meter, a **single-row cadence strip** (`CadenceStrip`, one cell
  per day) aligned under a shared month axis so rhythms compare straight
  down the page — replaces the stacked 7-row calendar heatmaps. Unchecked
  Key Results expand per person. `getCheckinCompliance` rows gained
  `employeeAvatarOption`.
- **Reports hub:** cards with a small drawing of each report's own
  visual (course, lanes, cascade, cadence) instead of plain text links.
- **Removed:** `components/charts/` entirely and the `recharts`
  dependency (`frontend/package.json` + lock) — no remaining users.
  Delete `frontend/src/components/charts/` from GitHub when applying;
  run `npm install` (Vercel does this on deploy).
- `useElementWidth` now re-attaches when its element mounts after the
  component (the Alignment canvas only exists once data loads).
- Verified in headless Chromium (all four pages, lineage hover, lane
  hover, 390px). `npm run build`, `npm test` (452), integration against
  real Postgres (31) all pass.

## 2026-09-25: Objectives, Objective Detail, Key Result Detail redesign; sunburst preview

- **Objective Detail:** navy hero (level tag, owner, title, status, Edit)
  with this Objective's own course line — Check-ins fetched per Key
  Result, the same call Key Result Detail makes; if restricted, the hero
  says so and the page still renders. "Where it sits" strip (what it
  rolls up into, what feeds it). Key Results as rows with the weight map
  above, share of score, confidence trail, last check-in (stale flagged),
  status, and inline "Add check-in" drawer + inline edit. Reflections as
  a readable list beside the form. `?checkin=` deep link now also scrolls
  the drawer into view. Edit/re-parent/level-move behaviour unchanged.
- **Objectives list:** status ring + by-level panel; Hierarchy (indent
  guides, level tags, owners) / List / Mine toggle; restyled create form.
  **Correctness fix:** the page said "current Cycle" but listed every
  Cycle's Objectives (the list endpoint isn't Cycle-scoped) — now filters
  to the active Cycle client-side, showing everything only when no Cycle
  is active.
- **Key Result Detail:** navy hero naming its Objective, with its own
  course line; Check-in timeline (submitter, confidence pips) beside the
  form and a confidence panel; Initiatives with a one-click status
  segment (was a dropdown), overdue due dates flagged, Done struck through.
- **SubmitCheckInForm:** score as status-coloured choices, confidence as
  a 1–5 segmented scale (Sam's Stage 2 review asked for exactly this —
  low friction, since it's on every Check-in). Must pick a score; same
  payload and endpoint.
- **Cascade sunburst — preview only, not built into the app.**
  `cascade-sunburst-preview.html` (standalone, sample 34-Objective org)
  shown to Mark to decide between it and the Alignment Map. Recommendation
  given: if built, make it a compact panel at the top of the Alignment
  Map (click a slice to scroll the canvas to it), not a fifth report;
  skipping it is also reasonable. **Awaiting Mark's decision.**
- Verified in headless Chromium (all three pages, check-in drawer deep
  link). `npm run build`, `npm test` (452), integration (31) pass. No
  backend changes this round.

## 2026-09-25 (later): cascade sunburst built; design pass finished app-wide

Mark approved the sunburst as an Alignment Map panel, and asked for every
remaining page to reach the same standard. No page is on the old look now.

- **Cascade sunburst** (`components/viz/CascadeSunburst.jsx`) — navy panel
  at the top of the Alignment Map. Rings by cascade LEVEL (Company
  innermost); slice width = leaves beneath; colour = status; titles along
  the arc only where they stay meaningful (whole title, or a cut keeping
  16+ characters). Unlinked Objectives float in their own ring with an
  empty wedge beneath. Hover/focus lights the lineage with a detail card;
  click scrolls the canvas to that card (`data-node`). Beside it, "Where
  the trouble sits": second-level branches ranked by share of Off Track /
  At Risk beneath them, click to jump. Reviewed at 2x in light, dark,
  highlighted and 390px states against a 34-Objective sample.
- **Navigation shell** (`App.jsx` + `shell.css`): sticky translucent bar,
  active-page pill, first name beside the avatar. **Mobile previously had
  no navigation links at all** — now a scrollable row under the bar.
- **Login + forced password change** (`components/AuthLayout.jsx`,
  `auth.css`): split layout, navy course-line panel left, form right;
  compact band on mobile. Voluntary Change Password is an in-app page.
  Password rules show as chips that turn green as they're met.
- **Shared inline styles refreshed** (`tokens.js` `s.*`): hairline panels,
  sentence-case table headers, pill buttons, 10px inputs, new
  `s.sectionTitle`; global focus ring in `index.css`. This is what lifts
  OKR Settings, Users, Tenants, Feature Flags, Audit Log and Settings
  without rewriting their form logic — behaviour unchanged.
- **OKR Settings**: sticky section index beside the seven panels
  (`settings.css`). **Settings**: panels in a responsive grid.
- **Users**: avatars and names; "Tenant administrator" in words.
- **Audit Log**: rows now plain English — "Checked in", "Updated an
  objective" — via `utils/auditText.js` (every code the services record is
  mapped; unknown codes fall back to a tidied form; 3 tests). Who shows
  an avatar, What/On split, local timestamps.
- **Copy**: requirement IDs (FR-007, FR-011, FR-022, FR-030) and "Stage 4"
  removed from on-screen text.
- `npm run build`, `npm test` (455), integration (31) pass. Every page
  shot in headless Chromium, including 390px for Login, Objectives and
  the sunburst.

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
- **Composite team "business review" view** — trend + roll-up + freeform
  wins/observations in one page. Partial overlap with Team Progress +
  Reflections; not currently its own FR.
- **AI OKR coaching** (tightening objective wording, suggesting
  outcome-based Key Results) — already anticipated by FR-022/section 8
  as a named future capability behind the AI Settings flag. Not a new
  idea, just not built.

## Next immediate step

1. **Deploy, then run "Recompute all OKR statuses"** from
   `tools/bootstrap-admin.html` if not yet done.
2. **Review the whole app in the browser** — this closes the design pass;
   every page is now on the new language.
3. **Pre-Handover Review** (security/performance/sizing) is the next
   formal stage gate once Mark is happy with Stage 4.
4. Still outstanding: apply `db/migrations/2026-09-18-audit-log-detail.sql`
   against Neon if not done.

## Open items, not yet resolved

- Trademark/domain check on "WayPoint" — flagged early in Stage 1, never
  externally confirmed.
- No second database region or Azure migration — deliberately deferred.
- Per-module dev-team review isn't leaving a durable record in the repo
  (see "Where things actually stand" above) — worth deciding how that
  should be tracked going forward so this kind of drift is caught sooner.
- Renaming a scoring rubric level's label doesn't trigger a status
  recompute (see 2026-09-23 above). Still not automatic, but there is
  now a manual remedy: "Recompute all OKR statuses" in
  `tools/bootstrap-admin.html` (2026-09-24).
- A roll-up status is a health reading of what's been reported so far;
  the UI doesn't yet show *how much* has been reported (e.g. "2 of 3
  inputs scored"). Worth considering alongside the design pass.
- This codebase has no frontend component test harness — a real,
  standing gap, not just a one-off. The refresh-logout and sign-out
  bugs (2026-09-23) are exactly the class of bug that gap allows
  through: `npm run build`/`npm test` passing proves the logic is
  sound, not that the actual browser experience is. Worth deciding
  whether that's worth setting up, or whether real-browser spot-checks
  stay the deliberate substitute.

## For a new chat picking this up

Read `reference.md` first (architecture, decisions, structure), then
this file. The repo itself (`github.com/mrdutoit/WayPoint`,
`waypoint-v1` folder) is the actual source of truth for what's built —
these two files are a map, not a substitute for reading the code when
precision matters.
