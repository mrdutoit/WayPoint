# WayPoint — Status

Current state and next steps. This is the part that goes stale — check
dates and re-verify against the actual repo/deployment before trusting
anything here, especially if it's been a while. For the stable
architecture description, see `reference.md` alongside this file.

**Last updated:** as of Stage 4, Module 2 (Objective, Key Result,
Cascade) delivered — built and test-verified in the sandbox
(100/100 tests, clean `npm run build`), **not yet applied to the live
Neon database or deployed to Vercel** — that's the next action, see
below.

## Where things actually stand

- **Stage 1 (Requirements):** Complete.
- **Stage 2 (Architecture & Design):** Complete. Six-persona design
  review done — see the Stage 2 document for findings. Requirements and
  Architecture document is at v0.3; Stage 2 Architecture and Design is
  at v0.4.
- **Stage 3 (Scaffold):** Complete and verified working end to end in
  production (GlobalAdmin login, feature flags admin, health check).
- **Stage 4 (Full build, module by module):**
  - Module 1 (Authentication and user management) — done, shipped as
    part of the Stage 3 scaffold.
  - Module 2 (Objective, Key Result, Cascade) — **built and tested in
    this session; not yet applied to the database or deployed.** See
    "Next immediate step."
  - Modules 3–8 (Initiatives/Check-ins/Reflections, primary
    cascade/scoring workflow, integrations, reporting, administration,
    mobile) — not started.
- **Pre-Handover Review (security/performance/sizing):** Correctly not
  yet run — belongs after all of Stage 4 completes, before Stage 5.

## What's confirmed working right now

- Sign-in (standalone auth, Argon2id + JWT), against the real deployed
  database
- Row-Level Security tenant isolation (schema + policies applied,
  chokepoint pattern in place)
- Feature flags: read + admin update, platform-wide
- Health check endpoint
- Platform Administrator bootstrap (`tools/bootstrap-admin.html`),
  on-demand, idempotent
- Full deployment pipeline: GitHub to Vercel, one project, colocated
  API — no known open issues with the deployment shape itself
- Branding: real logo image wired into favicon and in-app nav/login,
  Baloo 2 wordmark, blue brand palette matching the logo, icon alignment
  fixed, button colours matching the design system

## Module 2 — what's now built (Objective, Key Result, Cascade)

Built and tested against the Stage 2 data model (section 3) and
FR-004/010/012/014/015/016/017/019(partial)/020/023/024. Not yet applied
to any real database.

- `frontend/db/02-okr-core.sql` — cascade_level, cycle, scoring_rubric,
  rubric_level, objective, key_result, with RLS policies (FR-010). Two
  deliberate additions beyond the literal ERD: tenant_id added directly
  to key_result and rubric_level (the ERD's slimmed view omits it, but
  FR-010 says "every table") — flagged in the SQL file's header comment.
- Services: `cascadeLevelService.js`, `cycleService.js`,
  `scoringRubricService.js`, `objectiveService.js`, `keyResultService.js`,
  plus a new shared `errors.js` (ValidationError/ForbiddenError/
  NotFoundError, used consistently across all Module 2 services).
- Routers: `settings-router.js` (cascade-levels, rubric),
  `cycles-router.js`, `objectives-router.js`, `key-results-router.js`,
  plus a new `errorResponse.js` middleware mapping typed service errors
  to HTTP status codes (and logging + 500 for anything unrecognised).
  `vercel.json` updated with the new rewrites.
- Frontend: `OkrSettings.jsx` (TenantAdmin — cascade levels, cycles,
  scoring rubric), `Objectives.jsx` (list + create), `ObjectiveDetail.jsx`
  (detail, rename, add/edit Key Results). `App.jsx` and `api.js` updated.
- Tests: 10 new files, 85 new tests (100 total in the suite), covering
  FR-023 (cascade cycle prevention), FR-024 ("Not Started" defaults),
  FR-020 (visibility), and validation/authorisation per endpoint.
  `npm test` passes; `npm run build` is clean.

**Two open design points, deliberately not decided unilaterally — see
the header comments in `objectiveService.js`:**
1. FR-015's "at their permitted cascade level" has no defined
   role→level permission mapping in the Stage 2 doc, so any cascade
   level in the tenant is currently accepted from any Manager/Employee.
2. Ownership on create (a Manager assigning an Objective to a direct
   report) is inferred from user stories 7/8, not its own FR — flagged
   in case that inference is wrong.

**Deliberately out of scope for Module 2** (belongs with Module 7,
Administration): FR-013 terminology renaming, FR-025 OKR element
enable/disable toggles. Full FR-019 weighted roll-up is genuinely
blocked on Check-in (Module 3) — Key Result and Objective status can
only ever be "Not Started" until then; see the module notes in
`objectiveService.js`/`keyResultService.js`.

## Next immediate step

1. Apply `frontend/db/02-okr-core.sql` via the Neon SQL console (after
   `schema.sql`, which is already applied).
2. Push this delta to GitHub (drag the zip's top-level folder onto the
   repo root in github.dev) and let Vercel redeploy.
3. Verify end to end against the real deployment the same way Stage 3
   was verified — sign in, create a Cascade Level set and an active
   Cycle under OKR Settings, create an Objective, add a Key Result —
   before marking Module 2 confirmed working (not just tested in the
   sandbox).
4. Then start Module 3 — secondary entities: Initiative, Check-in,
   Reflection — against the same Stage 2 data model.

## Open items, not yet resolved

- Trademark/domain check on "WayPoint" — flagged early in Stage 1, never
  externally confirmed. Low priority given this is currently a personal
  build without an external client, but worth resolving before any real
  customer-facing launch.
- No second database region or Azure migration — deliberately deferred,
  see the Requirements document's roadmap section.

## For a new chat picking this up

Read `reference.md` first (architecture, decisions, structure), then
this file. The repo itself (`github.com/mrdutoit/WayPoint`,
`waypoint-v1` folder) is the actual source of truth for what's built —
these two files are a map, not a substitute for reading the code when
precision matters.
