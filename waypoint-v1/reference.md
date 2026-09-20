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

Tree below reflects the repo as of 2026-09-16 (Stage 4, Modules 1–3, 4,
6 partial, and 7 built — see `status.md`). Re-verify against the repo
before trusting this for anything precision-sensitive; file lists are
exactly the kind of thing that drifts fastest.

```
waypoint-v1/
├── frontend/                       <- the one Vercel project
│   ├── api/                        <- thin router files, each its own Vercel Function
│   │   ├── admin-router.js         (on-demand bootstrap)
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
│   │   ├── components/ (Avatar.jsx, DatePicker.jsx, Logo.jsx,
│   │   │   SubmitCheckInForm.jsx,
│   │   │   charts/ (StatCard.jsx, StatusDonut.jsx, StatusBarChart.jsx,
│   │   │   Sparkline.jsx, CalendarHeatmap.jsx, WeightingTreemap.jsx, icons.jsx))
│   │   ├── constants/avatarOptions.js
│   │   ├── context/ (FlagContext, RoleContext, TerminologyContext, ThemeContext)
│   │   ├── hooks/ (useFetch.js, useWindowSize.js)
│   │   ├── pages/
│   │   │   (AlignmentMap.jsx, AuditLog.jsx, ChangePassword.jsx, CheckinCompliance.jsx,
│   │   │    Dashboard.jsx, FeatureFlags.jsx, KeyResultDetail.jsx, Login.jsx,
│   │   │    ObjectiveDetail.jsx, Objectives.jsx, OkrSettings.jsx, Reports.jsx,
│   │   │    Scorecard.jsx, Settings.jsx, TeamProgress.jsx, TenantsAdmin.jsx,
│   │   │    UsersAdmin.jsx)
│   │   ├── services/api.js
│   │   ├── styles/tokens.js        <- design tokens, incl. brand colours, CHART_PALETTE
│   │   ├── utils/ (dateFormat.js, statusGroups.js, objectiveTree.js)
│   │   └── App.jsx
│   ├── public/                     <- favicon.png, favicon.svg, apple-touch-icon.png, waypoint-icon.png
│   ├── vercel.json                 <- routes friendly paths to the router files
│   └── package.json
├── tools/                          <- standalone local HTML admin utilities
│   ├── bootstrap-admin.html        (seeds flags + PlatformAdmin, on demand)
│   └── login-test.html             (verifies sign-in end to end)
├── tests/                          <- vitest, run from repo root; includes tests/integration/
└── README.md                       <- setup, deployment, env vars
```

## Tech stack

- **Frontend:** React 18 + Vite, React Router. No external UI library —
  hand-rolled design tokens in `tokens.js`.
- **API:** Node.js, deployed as individual Vercel Functions (one file per
  domain area under `frontend/api/`), not a monolithic Express app.
- **Database:** PostgreSQL via Neon, with Row-Level Security as the
  actual tenant-isolation boundary — not just an application-layer
  convention. See `api-lib/context/tenant.js`.
- **Auth:** Standalone (Argon2id password hashing + JWT), not SSO by
  default. SSO is a scaffolded, switched-off feature flag
  (`auth.sso.enabled`) for later.
- **Charts:** Recharts, themed entirely from `tokens.js` (`CHART_PALETTE`,
  `STATUS_META`) — never a hardcoded hex. Shared primitives live in
  `src/components/charts/` (`StatCard`, `StatusDonut`, `StatusBarChart`);
  a page groups its own data with `utils/statusGroups.js` and hands the
  result to one of these rather than each page reimplementing grouping.
- **Schema:** One plain SQL file (`db/schema.sql`), applied by hand via
  Neon's SQL console — deliberately not a migration library at this
  scale. A schema change ships as a short-lived migration file that gets
  applied to Neon and then folded back into `schema.sql` as the single
  current-state reference; the migration file itself doesn't persist in
  the repo once applied. This folding step was missed for the module
  that introduced `initiative`/`check_in`/`reflection` — corrected
  2026-09-16 (see `status.md`).

## Key design decisions worth knowing before changing anything

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
