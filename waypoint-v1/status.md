# WayPoint — Status

Current state and next steps. This is the part that goes stale — check
dates and re-verify against the actual repo/deployment before trusting
anything here, especially if it's been a while. For the stable
architecture description, see `reference.md` alongside this file.

**Last updated:** all four migrations from the previous round
(`02-okr-core.sql` through `05-terminology-and-element-config.sql`)
confirmed applied to Neon by Mark. `db/schema.sql` has been rewritten to
reflect that as a single current-state file, and the four migration
files deleted from the repo — back to the MedBroker convention (apply →
fold into `schema.sql` → delete the migration file), which had drifted
this round without a deliberate decision to change it. An
"Internal server error" hit while creating an Objective as Manager/
Employee is still open — see below, genuinely unresolved as of this
note, not something guessed at and silently marked fixed.

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
  - Module 2 (Objective, Key Result, Cascade) — built; the router bug
    below was specific to it and is now fixed.
  - FR-013 (Terminology) and FR-025 (OKR element toggles) — pulled
    forward from Module 7 this round, at Mark's request, since Module 2
    is "the functionality they're surrounded by."
  - Modules 3, 4, 5, 6, and the remainder of 7 (Initiatives/Check-ins/
    Reflections, primary cascade/scoring workflow, integrations,
    reporting, remaining administration) — not started.
- **Pre-Handover Review:** Correctly not yet run — belongs after Stage 4
  completes, before Stage 5.

## This round — a real production bug, plus direct testing feedback

Mark hit a 404 activating a Cycle as TenantAdmin. Root cause, and
everything that followed from fixing it properly rather than just
patching the one symptom:

### The router bug (affected every multi-segment route, not just cycles)

`vercel.json` rewrites with `?slug=:slug*` don't reliably deliver a
multi-segment path as an array — for `/api/cycles/{id}/activate` it
arrived as a single string `"cycle-1/activate"`, so
`[cycleId, subResource] = slugParts` silently left `subResource`
undefined and the router fell through to its generic 404. Single-segment
routes never exposed this, which is why it shipped in the first place.

MedBroker had already hit and solved this exact problem
(`api-lib/http/helpers.js`'s `parseSlug`) — ported that fix rather than
re-inventing one, and applied it to **every** router (`objectives-router.js`'s
add-Key-Result, `users-router.js`'s role-change and force-password-reset
were equally exposed, not just cycle activation). Also fixed the deeper
issue: every router test was mocking `req.query.slug` as a pre-split
array, which is exactly what let this ship with 100% tests passing —
tests now simulate the real joined-string shape (`tests/httpHelpers.test.js`
plus every router test file's `mockReq`).

### Cadence entity + Cycle rework

Direct feedback: Cycle activation should be date-driven, not a manual
toggle; Cadence should be a tenant-editable dropdown (Monthly/Quarterly/
Bi-Annually/Annually as defaults), not free text; end date should be
computed from start date + Cadence.

- New `okr.cadence` entity, seeded with the four defaults on tenant
  creation, tenant-editable (create/update/delete) via
  `/api/settings/cadences`. **Locked once used by a Cycle** — Mark
  explicitly asked for this to be "figured out," not left as a gap; see
  `cadenceService.js`'s module comment for the full reasoning (the
  underlying data isn't actually at risk — a Cycle's end_date is
  computed once and stored, never live-linked — the lock exists so
  "Quarterly" can't quietly mean something different for cycles created
  before vs. after an edit).
- `okr.cycle` reworked: `cadence_id` replaces the free-text `cadence`
  column; `end_date` is always server-computed
  (`dateMath.js` — tested against the exact existing Q3 2026 sample
  data, which round-trips correctly: Jul 1 → Sep 30); `is_active` is
  gone entirely — "active" is computed from today's date against
  `[start_date, end_date]`; no two Cycles in a tenant may cover the same
  day, enforced at the database layer via a Postgres EXCLUDE constraint,
  not just application validation.
- `POST /api/cycles/:id/activate` is retired.
- Migration (`db/04-cadence-and-cycle-rework.sql`) includes an explicit
  backfill-and-verify step for existing test data (e.g. the "Q3 2026"
  cycle already created while testing), not a blind schema swap — read
  its own header before running it.

### Custom DatePicker

"Make date fields pickable" — matched against MedBroker's own precedent
exactly (`components/DatePicker.jsx`, an internal/staff-facing calendar
popover, native `<input type="date">` deliberately reserved for
public-facing forms — WayPoint has none of those yet, so this applies
everywhere). Simplified from MedBroker's version in one deliberate way:
no typed free-text entry, since that's tied to an app-wide day-first
date-*format* standard MedBroker established that WayPoint hasn't — see
the component's own header comment. Wired into the Cycles form's start
date; the value contract (`'YYYY-MM-DD'` string via `onChange`) makes it
a drop-in replacement anywhere else a date field is added later.

### FR-013 (Terminology) and FR-025 (OKR element toggles) — pulled forward

- **FR-025:** `okr.okr_element_config`, seeded all-enabled on tenant
  creation. Dependency graph (Objective never disableable; disabling an
  element is rejected while an enabled dependent still exists; enabling
  auto-enables the prerequisite chain) in
  `okrElementConfigService.js`. **One resolved ambiguity, flagged rather
  than silently picked:** the Stage 2 doc's section 3.1 table says
  disabling Key Result "automatically switches off Initiative and
  Check-in" (reads like a cascade), but FR-025's own text says disabling
  is "rejected server-side... naming the dependent element(s)" (no
  cascade at all). Implemented per FR-025's literal, fully-specified
  text — reject, don't cascade. The one live gate: `createKeyResult`
  now actually checks the toggle. Initiative/Check-in/Reflection toggle
  with no functional effect yet (those entities don't exist until
  Module 3) — same "scaffolded ahead of use" pattern as FR-022's AI
  Settings menu.
- **FR-013:** `okr.terminology_setting` (absence of a row = default
  English term — nothing seeded). `TerminologyContext.jsx`/`useTerms()`
  applies custom labels to primary UI surfaces — nav, page titles,
  section headers, main create/add buttons, across `App.jsx`,
  `Objectives.jsx`, `ObjectiveDetail.jsx`, `OkrSettings.jsx`. **Explicit
  scope boundary, not exhaustive:** backend validation-error text (e.g.
  "cadenceId does not exist") is untouched — see
  `terminologyService.js`'s module comment. Pluralisation is a plain
  heuristic (`TerminologyContext.jsx`'s `pluralise()`), not a full
  inflection library — correct for ordinary business nouns, not
  guaranteed for every irregular plural.

### Multi-role testing friction (no code change — a workaround)

`api.js`'s auth token lives in a plain JS module variable, not shared
storage — each browser tab loads its own independent copy. Opening one
tab per role and logging in fresh in each already works without
conflict; the one thing that breaks it is refreshing a tab, which wipes
that tab's session only. Session persistence itself (surfaced after
Module 2) remains open — a real decision (localStorage vs. something
more deliberate), not fixed here.

## Next immediate step

1. In GitHub, delete the four migration files this round folded into
   `schema.sql` — they're already gone from this delivery's zip, but
   deleting them from the actual repo is a manual step on your side
   (dragging a folder onto github.dev merges/adds, it doesn't delete
   files absent from the zip): `02-okr-core.sql`,
   `03-user-management.sql`, `04-cadence-and-cycle-rework.sql`,
   `05-terminology-and-element-config.sql`.
2. Push this delta to GitHub and let Vercel redeploy.
3. **Diagnose the "Internal server error" on Objective creation.**
   Static review of `objectiveService.js`'s full create path, the real
   (never-mocked-in-tests) `withTenantContext`, and `auditService.js`
   didn't surface an obvious bug — which means either a genuine
   production-only issue (a SQL typo my mocked tests can't catch, since
   they never validate real SQL against a real schema) or a missing
   prerequisite (no Cycle yet covering today's date, though that should
   surface as a specific 400, not this generic 500). The real error is
   sitting in Vercel's function logs — `errorResponse.js` was built
   specifically to log unrecognised exceptions there
   (`logger.error(..., 'Unhandled error in a Module 2 route')`) rather
   than lose them. Pull that log text before guessing further.
4. Once that's fixed, re-verify end to end: cycle creation with a
   Cadence dropdown and no manual end date, that no "activate" control
   remains, that renaming a term under OKR Settings actually changes the
   nav/page titles, and that disabling Key Result actually blocks
   creating one.
5. Then continue Stage 4 at Module 3 (secondary entities: Initiative,
   Check-in, Reflection) against the same Stage 2 data model — this is
   also when the OKR Elements toggles for those three actually start
   having a visible effect.

## Open items, not yet resolved

- Trademark/domain check on "WayPoint" — low priority, no external
  client yet.
- No second database region or Azure migration — deliberately deferred.
- Self-service "forgot password" has a backend but no frontend —
  needs an explicit decision, not a default assumption.
- Session persistence and revocation — same.
- FR-015's "at their permitted cascade level" has no defined role→level
  permission mapping (any cascade level is currently accepted from any
  Manager/Employee) — flagged when Module 2 shipped, still open.

## For a new chat picking this up

Read `reference.md` first (architecture, decisions, structure), then
this file. The repo itself (`github.com/mrdutoit/WayPoint`,
`waypoint-v1` folder) is the actual source of truth for what's built —
these two files are a map, not a substitute for reading the code when
precision matters.
