# WayPoint — Status

Current state and next steps. This is the part that goes stale — check
dates and re-verify against the actual repo/deployment before trusting
anything here, especially if it's been a while. For the stable
architecture description, see `reference.md` alongside this file.

**Last updated:** as of Stage 4, Module 2 (Objective, Key Result,
Cascade) plus the user-management follow-up (tenant provisioning, user
invite, password management) built this session — 147/147 tests, clean
`npm run build`. Module 2's *code* is confirmed deployed (the
`/objectives` "tenant-scoped" message rendering correctly for
PlatformAdmin is only reachable if `objectives-router.js` is live), but
whether `02-okr-core.sql` has actually been applied to Neon is not
confirmed from this session — that query path was never reached, since
the block happens before any database access. The user-management work
below is **not yet applied or deployed at all** — that's the next
action, see below.

## Where things actually stand

- **Stage 1 (Requirements):** Complete.
- **Stage 2 (Architecture & Design):** Complete. Six-persona design
  review done — see the Stage 2 document for findings. Requirements and
  Architecture document is at v0.3; Stage 2 Architecture and Design is
  at v0.4.
- **Stage 3 (Scaffold):** Complete and verified working end to end in
  production (GlobalAdmin login, feature flags admin, health check).
- **Stage 4 (Full build, module by module):**
  - Module 1 (Authentication and user management) — **corrected
    classification:** Stage 3 only ever shipped Authentication.
    Tenant provisioning (FR-011) and user invite/role management were
    already specified in the Stage 2 API table (`POST /api/tenants`,
    `POST /api/users/invite`, `PATCH /api/users/:id/role`) but never
    built — this is what blocked testing Module 2 as anyone other than
    Platform Administrator. Now built in this session; see below. Module
    1 is genuinely complete once this is applied and verified.
  - Module 2 (Objective, Key Result, Cascade) — built and tested;
    **not yet applied to the database or deployed.**
  - Modules 3–8 (Initiatives/Check-ins/Reflections, primary
    cascade/scoring workflow, integrations, reporting, administration,
    mobile) — not started.
- **Pre-Handover Review (security/performance/sizing):** Correctly not
  yet run — belongs after all of Stage 4 completes, before Stage 5.

## What's confirmed working right now (verified against production)

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

Everything below this point is sandbox-built and test-verified only —
**not yet confirmed against the real deployment.**

## User management — what's now built (closing the Module 1 gap)

Built in direct response to hitting a real testing blocker: Platform
Administrator had no way to create a tenant or a user, and with SSO
switched off there was no password-management story at all. Pattern
matched against MedBroker's equivalent (§72/§118) rather than invented —
see `reference.md`'s design-decisions section for the specifics adopted
(password complexity rule, `password_must_change` semantics).

- `frontend/db/03-user-management.sql` — adds `password_must_change` to
  `user_account`.
- `tenantService.js` + `tenants-router.js` — `POST /api/tenants` (FR-011:
  Platform Administrator creates a tenant and its first Tenant
  Administrator together, one transaction), `GET /api/tenants` (list —
  addition beyond the literal API table, flagged in the router file),
  `GET /api/tenants/:id`.
- `userService.js` + `users-router.js` — `GET /api/users`,
  `POST /api/users/invite` (Tenant Administrator creates Manager/
  Employee), `PATCH /api/users/:id/role`, and
  `PUT /api/users/:id/force-password-reset` (addition beyond the literal
  table, mirrors MedBroker's force-password-reset).
- `authService.js` — `checkPasswordComplexity()` (12+ chars, upper/
  lower/digit/symbol), now the single password policy used everywhere a
  password is set: invite, force-reset, self-service reset-password
  (tightened from its old bare length check), and the new change-password
  endpoint below.
- `auth-router.js` — new `PUT /api/auth/change-password` (self-service,
  requires current password, clears `password_must_change`, issues a
  fresh token); login now returns `passwordMustChange` so the frontend
  can gate on it.
- Frontend: `ChangePassword.jsx` (forced — blocks the whole app via
  `App.jsx`'s `RequireAuth` until cleared; and voluntary, via a
  "Change password" nav link), `TenantsAdmin.jsx` (Platform
  Administrator — create/list tenants), `UsersAdmin.jsx` (Tenant
  Administrator — invite, role change, force-reset). `api.js`, `App.jsx`,
  `Login.jsx` updated.
- Tests: 5 new files, 47 new tests (147 total in the suite). `npm test`
  passes; `npm run build` is clean.

**Deliberately out of scope:** the self-service "forgot password" flow
(`POST /api/auth/reset-password/request` + `/confirm`) was already built
in Stage 3 but has never had a frontend — still true after this session.
Left alone because it isn't part of the MedBroker pattern this was
matched against (MedBroker is SSO-primary with no self-service password
recovery at all) and wasn't the actual blocker. Worth a separate,
explicit decision on whether WayPoint needs it given standalone auth is
the *default* here, not a fallback.

**Two pre-existing gaps surfaced while building this, not introduced by
it** — see `reference.md`'s design-decisions section for the full
reasoning:
1. No server-side session revocation — a Bearer JWT stays valid until it
   naturally expires, even after a password change.
2. `api.js` holds the auth token in a module-level variable only, not
   persisted to storage — a page refresh currently logs everyone out.

Both are worth a decision before they matter for anything higher-stakes
than OKR content; neither was fixed here since both involve a real
security/UX trade-off (e.g. localStorage vs httpOnly cookies) that
shouldn't be decided unilaterally mid-build.

## Module 2 — what's now built (Objective, Key Result, Cascade)

Built and tested against the Stage 2 data model (section 3) and
FR-004/010/012/014/015/016/017/019(partial)/020/023/024.

- `frontend/db/02-okr-core.sql` — cascade_level, cycle, scoring_rubric,
  rubric_level, objective, key_result, with RLS policies (FR-010). Two
  deliberate additions beyond the literal ERD: tenant_id added directly
  to key_result and rubric_level (the ERD's slimmed view omits it, but
  FR-010 says "every table") — flagged in the SQL file's header comment.
- Services: `cascadeLevelService.js`, `cycleService.js`,
  `scoringRubricService.js`, `objectiveService.js`, `keyResultService.js`,
  plus a shared `errors.js` (ValidationError/ForbiddenError/NotFoundError,
  used consistently across all services added this session, Module 2 and
  user management alike).
- Routers: `settings-router.js` (cascade-levels, rubric),
  `cycles-router.js`, `objectives-router.js`, `key-results-router.js`,
  plus `errorResponse.js` middleware mapping typed service errors to
  HTTP status codes (and logging + 500 for anything unrecognised).
- Frontend: `OkrSettings.jsx` (TenantAdmin — cascade levels, cycles,
  scoring rubric), `Objectives.jsx` (list + create), `ObjectiveDetail.jsx`
  (detail, rename, add/edit Key Results).
- Tests: 10 files, 85 tests, covering FR-023 (cascade cycle prevention),
  FR-024 ("Not Started" defaults), FR-020 (visibility), and
  validation/authorisation per endpoint.

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

1. Apply, in order, via the Neon SQL console: `02-okr-core.sql` (if not
   already applied from the prior delivery), then `03-user-management.sql`.
2. Push this delta to GitHub (drag the zip's top-level folder onto the
   repo root in github.dev) and let Vercel redeploy.
3. Verify end to end against the real deployment, in this order — each
   step depends on the last actually working:
   a. Sign in as the existing GlobalAdmin/PlatformAdmin.
   b. Create a tenant + first Tenant Administrator under Tenants.
   c. Sign in as that Tenant Administrator — confirm the forced
      change-password screen appears, complete it, confirm it lands in
      the app.
   d. Under OKR Settings, configure Cascade Levels, create and activate
      a Cycle, configure a Scoring Rubric.
   e. Under Users, invite a Manager and an Employee; confirm each can
      sign in and is forced through change-password too.
   f. As the Manager or Employee, create an Objective and a Key Result.
4. Only once all of that is confirmed — not just sandbox-tested — mark
   Module 1 and Module 2 both genuinely done.
5. Then start Module 3 — secondary entities: Initiative, Check-in,
   Reflection — against the same Stage 2 data model.

## Open items, not yet resolved

- Trademark/domain check on "WayPoint" — flagged early in Stage 1, never
  externally confirmed. Low priority given this is currently a personal
  build without an external client, but worth resolving before any real
  customer-facing launch.
- No second database region or Azure migration — deliberately deferred,
  see the Requirements document's roadmap section.
- Self-service "forgot password" has a backend but no frontend (see
  above) — needs an explicit decision, not a default assumption either
  way.
- Session persistence and revocation (see above) — same.

## For a new chat picking this up

Read `reference.md` first (architecture, decisions, structure), then
this file. The repo itself (`github.com/mrdutoit/WayPoint`,
`waypoint-v1` folder) is the actual source of truth for what's built —
these two files are a map, not a substitute for reading the code when
precision matters.
