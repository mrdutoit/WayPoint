# WayPoint — Status

Current state and next steps. This is the part that goes stale — check
dates and re-verify against the actual repo/deployment before trusting
anything here, especially if it's been a while. For the stable
architecture description, see `reference.md` alongside this file.

**Last updated:** 2026-09-24. Originally reconstructed 2026-09-16 directly
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
    wherever weighting or cascade position changes.
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
- Reporting: Scorecard, Team Progress, Alignment Map (collapsible tree,
  not a visual canvas), Check-in Compliance — Dashboard, Team Progress,
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
- Dashboard given a real design pass (2026-09-16, extended 2026-09-24)
  rather than left as generic identical-card styling — see History

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
- Cascade sunburst — last of the three chart candidates (heatmap and
  treemap are both done); not started

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
  renders as an indented list, not a box-and-connector canvas. The
  cascade sunburst (still not built, see above) is the more visually
  ambitious version of this same idea.
- **Composite team "business review" view** — trend + roll-up + freeform
  wins/observations in one page. Partial overlap with Team Progress +
  Reflections; not currently its own FR.
- **AI OKR coaching** (tightening objective wording, suggesting
  outcome-based Key Results) — already anticipated by FR-022/section 8
  as a named future capability behind the AI Settings flag. Not a new
  idea, just not built.

## Next immediate step

Three threads open, none blocking the others:

1. **The design pass, continuing.** Dashboard now has real materiality
   (2026-09-24). The rest of the app — Objective Detail (the original
   pilot proposal), Objectives list, Key Result Detail, Settings,
   Users, Tenants — hasn't had this treatment. Awaiting direction on
   which page next, or whether to move through them systematically.
2. **Verification catch-up.** `db/migrations/2026-09-18-audit-log-detail.sql`
   still needs applying against Neon if that hasn't happened (nothing
   shows entity labels/diffs until it does), and a long run of
   deliveries now have only been verified by `npm run build`/`npm test`
   passing, not by real browser use signed in as an actual Tenant
   Administrator.
3. **Cascade sunburst** — last of the three chart candidates, not
   started.

## Open items, not yet resolved

- Trademark/domain check on "WayPoint" — flagged early in Stage 1, never
  externally confirmed.
- No second database region or Azure migration — deliberately deferred.
- Per-module dev-team review isn't leaving a durable record in the repo
  (see "Where things actually stand" above) — worth deciding how that
  should be tracked going forward so this kind of drift is caught sooner.
- Renaming a scoring rubric level's label doesn't trigger a status
  recompute (see 2026-09-23 above) — a lower-frequency version of the
  same staleness class as the weighting/re-parent gaps already closed.
  Not fixed yet; flagged here rather than silently dropped.
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
