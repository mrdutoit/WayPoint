# WayPoint — Reference

Stable project reference. This describes what WayPoint *is* and how it's
built — architecture, structure, decisions. For current progress and
next steps, see `status.md` alongside this file.

## What this is

WayPoint is a multi-tenant OKR (Objectives and Key Results) tracking
platform. Built on Vercel with PostgreSQL (Neon). Intended both for
internal use and as a product resold to customers (each customer
organisation is a tenant).

Two formal design documents exist as the source of truth for
requirements and architecture decisions — read these before making any
design-level change, not just this file:
- **Requirements and Architecture** (v0.3) — business requirements,
  the five OKR elements (Objectives, Key Results, Initiatives, Check-ins,
  Reflections), roles, high-level architecture, data residency position
- **Stage 2 Architecture and Design** (v0.4) — full data model, ERDs,
  the complete FR-001 through FR-033 functional requirement list, API
  design table, the six-persona design review findings

## Repository

- GitHub: `mrdutoit/WayPoint`
- Top-level folder inside the repo: `waypoint-v1`
- One Vercel project, Root Directory `waypoint-v1/frontend`

## Architecture

**One Vercel project — not split frontend/API.** `api/` and `api-lib/`
are colocated inside `frontend/`, deployed together. This mirrors a
verified working pattern (checked directly against another production
codebase) rather than the two-project split an earlier iteration of this
scaffold used.

Tree below reflects the repo as of 2026-09-24 (Stage 4, Modules 1–3, 4,
6 partial, and 7 built — see `status.md`). Re-verify against the repo
before trusting this for anything precision-sensitive; file lists are
exactly the kind of thing that drifts fastest.

```
waypoint-v1/
├── frontend/                       <- the one Vercel project
│   ├── api/                        <- thin router files, each its own Vercel Function
│   │   ├── admin-router.js         (on-demand bootstrap; one-off status recompute)
│   │   ├── auth-router.js          (login, password reset/change)
│   │   ├── flags-router.js         (list/update feature flags)
│   │   ├── health.js
│   │   ├── key-results-router.js   (Key Results, Initiatives, Check-ins)
│   │   ├── objectives-router.js    (Objectives, Key Result creation, Reflections)
│   │   ├── reports-router.js       (scorecard, team-progress, alignment-map, checkin-compliance)
│   │   ├── settings-router.js      (cascade levels, terminology, rubric, cadences, OKR elements)
│   │   ├── tenants-router.js       (tenant provisioning, billing mode, data export;
│   │   │                            also serves /api/audit-log/* via a
│   │   │                            ?resource=audit-log rewrite — see vercel.json —
│   │   │                            to stay under Vercel's 12-function Hobby ceiling)
│   │   └── users-router.js         (user admin, invites, role changes)
│   ├── api-lib/                    <- the real logic, never deployed directly
│   │   ├── config.js
│   │   ├── context/tenant.js       (Row-Level Security chokepoint)
│   │   ├── csv.js                  (dependency-free CSV writer, shared by export features)
│   │   ├── http/helpers.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── errorResponse.js
│   │   └── services/
│   │       (auditService.js, authService.js, bootstrapService.js,
│   │        cadenceService.js, cascadeLevelService.js, checkInService.js,
│   │        cycleService.js, dateMath.js, db.js, errors.js, exportService.js,
│   │        flagService.js, initiativeService.js, keyResultService.js,
│   │        logger.js, objectiveService.js, okrElementConfigService.js,
│   │        profileService.js, reflectionService.js, reportingService.js,
│   │        scoringRubricService.js, scoringService.js, tenantService.js,
│   │        terminologyService.js, userService.js)
│   ├── db/
│   │   └── schema.sql              <- plain SQL, applied manually via Neon's console
│   ├── src/                        <- the React app
│   │   ├── components/ (Avatar.jsx, DatePicker.jsx, ErrorBoundary.jsx, Logo.jsx,
│   │   │   SubmitCheckInForm.jsx,
│   │   │   AuthLayout.jsx + auth.css (sign-in screens),
│   │   │   viz/ (CourseLine.jsx, Lanes.jsx, CascadeSunburst.jsx, StatusRing.jsx, StatusBars.jsx, WeightMap.jsx,
│   │   │     ConfidenceTrail.jsx, CadenceStrip.jsx, Tooltip.jsx, viz.css — every chart))
│   │   ├── constants/avatarOptions.js
│   │   ├── context/ (FlagContext, RoleContext, TerminologyContext, ThemeContext)
│   │   ├── hooks/ (useElementWidth.js, useFetch.js, useWindowSize.js)
│   │   ├── pages/
│   │   │   (AlignmentMap.jsx, AuditLog.jsx, ChangePassword.jsx, CheckinCompliance.jsx,
│   │   │    Dashboard.jsx, FeatureFlags.jsx, KeyResultDetail.jsx, Login.jsx,
│   │   │    ObjectiveDetail.jsx, Objectives.jsx, OkrSettings.jsx, Reports.jsx,
│   │   │    Scorecard.jsx, Settings.jsx, TeamProgress.jsx, TenantsAdmin.jsx,
│   │   │    UsersAdmin.jsx; page stylesheets dashboard.css, scorecard.css, reports.css, alignment.css, objectives.css, settings.css)
│   │   ├── services/api.js
│   │   ├── styles/tokens.js        <- design tokens, incl. brand colours, CHART_PALETTE
│   │   ├── utils/ (auditText.js, cycleMath.js, squarify.js, strategyLayout.js, dateFormat.js, statusGroups.js, objectiveTree.js, jwt.js)
│   │   ├── shell.css               <- app navigation bar
│   │   └── App.jsx
│   ├── public/                     <- favicon.png, favicon.svg, apple-touch-icon.png, waypoint-icon.png
│   ├── vercel.json                 <- routes friendly paths to the router files
│   └── package.json
├── tools/                          <- standalone local HTML admin utilities
│   ├── bootstrap-admin.html        (seeds flags + PlatformAdmin; recomputes all OKR statuses)
│   └── login-test.html             (verifies sign-in end to end)
├── tests/                          <- vitest, run from repo root; includes tests/integration/
├── e2e/                            <- Playwright browser tests (config, fixtures, specs)
└── README.md                       <- setup, deployment, env vars
```

## Tech stack

- **Frontend:** React 18 + Vite, React Router. No external UI library —
  hand-rolled design tokens in `tokens.js`. Typefaces (2026-09-24):
  Instrument Sans for all UI text, Bricolage Grotesque for display
  moments (`--font-display` in `index.css`), both from Google Fonts in
  `index.html`. Pages are mostly inline-styled from `tokens.js`; the
  Dashboard uses its own plain stylesheet (`dashboard.css`) because it
  needs hover states, media queries and a keyframed animation.
- **Error handling in the UI:** every page renders inside
  `ErrorBoundary` (in `App.jsx`'s `Shell`, keyed by pathname) — a render
  crash shows an error panel with the nav intact, never a blank page.
- **API:** Node.js, deployed as individual Vercel Functions (one file per
  domain area under `frontend/api/`), not a monolithic Express app.
- **Database:** PostgreSQL via Neon, with Row-Level Security as the
  actual tenant-isolation boundary — not just an application-layer
  convention. See `api-lib/context/tenant.js`.
- **Auth:** Standalone (Argon2id password hashing + JWT), not SSO by
  default. SSO is a scaffolded, switched-off feature flag
  (`auth.sso.enabled`) for later.
- **Charts:** hand-built SVG/HTML in `src/components/viz/`, no chart
  library (Recharts was removed 2026-09-24 once the last page moved off
  it). `CourseLine` (Cycle-as-course hero, Dashboard + Scorecard),
  `Lanes` (one course per person, Team Progress), `CascadeSunburst`
  (Alignment Map panel), `StatusRing`,
  `StatusBars`, `WeightMap` (squarified treemap via `utils/squarify.js`,
  one per Objective), `ConfidenceTrail`, `CadenceStrip` (one cell per day
  of the Cycle), and one shared `Tooltip`/`CheckInDetail` card. Rules:
  status colour is the only colour (`STATUS_META`), no axes or gridlines
  unless they carry meaning, every mark answers hover AND keyboard focus
  with the detail behind it. Styles in `viz.css`. A page groups its data
  with `utils/statusGroups.js` rather than reimplementing grouping. The
  Alignment Map's canvas layout is `utils/strategyLayout.js` (pure,
  tested); the component only draws.
- **Working pages (2026-09-24):** Objectives, Objective Detail and Key
  Result Detail share `objectives.css` — pill buttons (`.ob-btn-*`),
  form fields (`.ob-field`, still using `s.formInput`/`s.select` from
  `tokens.js` for the inputs themselves), panels, Key Result rows,
  Initiative status segments. `SubmitCheckInForm` uses status-coloured
  score choices and a 1–5 confidence scale (no dropdowns).
- **Settings/admin pages** still render from `tokens.js` inline styles
  (`s.card`, `s.table`, `s.btnPrimary`, `s.sectionTitle`…), refreshed
  2026-09-25 to the same language — change the look there, not per page.
- **Signature surface:** the navy chart panel (`.db-hero` in
  `dashboard.css`) is used for the one "hero" visual per page — course
  line, team lanes, the alignment canvas. Everything else sits on quiet
  panels and rows. Keep it to one navy panel per page.
- **Testing (2026-09-25):** three layers, all run by GitHub Actions on
  every push (`.github/workflows/ci.yml` at the repository root — outside
  `waypoint-v1/`): unit (`npm test`, vitest, mocked DB), integration
  (`npm run test:integration`, real Postgres, applies `schema.sql` fresh),
  browser (`npm run test:e2e`, Playwright against the built frontend with
  the API mocked from `e2e/fixtures.js`). When an API response shape
  changes, update the matching fixture — a page rendering against a
  stale fixture is exactly what the e2e layer is there to catch. Every
  browser-only bug fixed gets a regression test in `interactions.spec.js`.
- **Schema:** One plain SQL file (`db/schema.sql`), applied by hand via
  Neon's SQL console — deliberately not a migration library at this
  scale. A schema change ships as a short-lived migration file that gets
  applied to Neon and then folded back into `schema.sql` as the single
  current-state reference; the migration file itself doesn't persist in
  the repo once applied. This folding step was missed for the module
  that introduced `initiative`/`check_in`/`reflection` — corrected
  2026-09-16 (see `status.md`).

## Key design decisions worth knowing before changing anything

- **Auth session persists via `localStorage`, restored at module load
  in `services/api.js` and reconstructed into `RoleContext`'s `user` on
  mount** — a page refresh used to silently log everyone out (fixed
  2026-09-23) because the token previously lived only in an in-memory
  variable. If you're touching auth, know that the token and the
  `user` object are two separately-maintained things that have to stay
  in sync (`setAuthToken`/`clearAuthToken` in `api.js` only touch the
  token; call sites are responsible for also calling `setUser`).
- **`user_account.tenant_id` is nullable.** PlatformAdmin is internal
  staff, never assigned to a tenant. Every auth code path (login,
  password reset, flag access) branches on this explicitly.
- **RLS session variables are set via parameterised `set_config()`,
  never string-interpolated `SET LOCAL`** — the former is injection-safe,
  the latter isn't. See `api-lib/context/tenant.js`.
- **Platform seeding is on-demand, not automatic.** No build-time hook.
  `tools/bootstrap-admin.html` calls `admin-router.js`, gated by
  `BOOTSTRAP_SECRET`, reading `PLATFORM_ADMIN_EMAIL`/`PASSWORD` from
  Vercel's environment — never from the request.
- **CORS is restrictive by default**, with a narrow, explicitly-commented
  exception for `auth-router.js` and `admin-router.js` only — both are
  already protected by their own mechanism (lockout, or the bootstrap
  secret) independent of caller origin, which is what makes the
  exception safe rather than a general loosening.
- **Objective/Key Result visibility was broadened from FR-020's literal
  text** to tenant-wide read access for any authenticated member — Edit
  rights stayed exactly as narrow as FR-020 originally specified (owner
  or owner's direct Manager only). Check-in comments and Reflection
  content were deliberately *not* broadened alongside this — they stay
  restricted to owner/Manager/TenantAdmin, since that's where genuinely
  sensitive personal commentary lives. See `objectiveService.js`'s
  module comment for the full reasoning.
- **Score roll-up rule (FR-019, `scoringService.js`).** An Objective's
  inputs are its own Key Results (weighted-averaged into one item) plus
  each child Objective (one item each), averaged and rounded to the
  nearest rubric level. Unscored inputs (no Check-in / child "Not
  Started") are excluded from the average but block the top level: the
  rubric's highest level ("Achieved") is reached only when every input
  is scored and at that level, otherwise capped one below. The same pass
  writes coverage (`inputs_reporting`/`inputs_total`, per Key Result and
  per child) shown as "3 of 5 reporting". Saving the scoring rubric
  recomputes the tenant automatically. Changing
  these rules leaves stored statuses stale — run "Recompute all OKR
  statuses" (`tools/bootstrap-admin.html` →
  `GET /api/admin/recompute-statuses`) after any such change.
- **Cascade linking is optional at creation (FR-015 as written), not
  enforced.** An Objective can be created without a parent even when an
  eligible parent already exists, and can be re-parented later via edit.
  This matches how Perdoo and ClickUp both handle goal alignment — as a
  separate linking action, not a create-time gate.
- **A test file that imports a package directly needs it in the ROOT
  `package.json`, not just `frontend/package.json`.** Tests run from the
  repo root (`waypoint-v1/`), and Node/Vite resolves a bare import
  relative to the file containing it — a service file under `frontend/`
  correctly finds `frontend/node_modules`, but a test file under
  `tests/` (outside `frontend/`) cannot, and needs its own copy in root
  `node_modules`. This is why `pg` and now `jszip` are root
  devDependencies despite no service file importing either directly —
  something under `tests/` needs them resolvable from its own location.

## Roles

| Role | Notes |
|---|---|
| PlatformAdmin | Internal staff only. Never assigned to a tenant. |
| TenantAdmin | Per-tenant administrator. |
| Manager | Sets/reviews team OKRs. |
| Employee | Owns individual OKRs. |

## Feature flags (platform defaults, seeded by bootstrap)

| Flag | Type | Default | Reference |
|---|---|---|---|
| `billing.mode` | enum | `manual` | FR-021 |
| `auth.sso.enabled` | boolean | `false` | FR-029 |
| `security.fieldEncryption.enabled` | boolean | `false` | FR-028 |
| `ai.settingsMenu.enabled` | boolean | `false` | FR-022 |

## Brand

- Name: **WayPoint** (capital P) — GitHub repo matches this exactly;
  the internal folder stays lowercase-hyphenated (`waypoint-v1`),
  following the same convention as the MedBroker project.
- Icon: a real cropped/processed image (`public/waypoint-icon.png`),
  not hand-coded SVG — a compass ring + centre point + navigation arrow,
  on a navy tile.
- Dashboard hero palette derives from the mark itself: the icon tile's
  navy (`#0b1b3a`) as the panel, the wordmark gradient (`#6FE8FF` →
  `#2E8CF0`) as the course line. Reuse these for any future "signature"
  surface rather than inventing new accents.
- Wordmark: real coded text, Baloo 2 (loaded via `index.html`), "Way" in
  dark ink, "Point" with a CSS gradient (`#6FE8FF` to `#1A5FD0`).
- Brand colours (`tokens.js`): `brand500 #2E8CF0`, `brand600 #1A5FD0`,
  `brand700 #123F9E` — blue, matching the logo. An earlier indigo/violet
  palette was replaced once the logo's actual colours were locked in —
  if anything still looks purple, it's stale.

## Naming convention (applies to any future project, not just this one)

- GitHub repository name: TitleCase matching the product name exactly.
- Internal top-level folder: lowercase-hyphenated-versioned
  (`waypoint-v1`, `medbroker-v1`).
- Confirm both before the first scaffold delivery — expensive to change
  once a Vercel Root Directory points into the folder.
