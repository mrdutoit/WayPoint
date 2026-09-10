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

```
waypoint-v1/
├── frontend/                  <- the one Vercel project
│   ├── api/                   <- thin router files, each its own Vercel Function
│   │   ├── health.js
│   │   ├── auth-router.js     (login, password reset)
│   │   ├── flags-router.js    (list/update feature flags)
│   │   └── admin-router.js    (on-demand bootstrap)
│   ├── api-lib/                <- the real logic, never deployed directly
│   │   ├── config.js
│   │   ├── context/tenant.js   (Row-Level Security chokepoint)
│   │   ├── middleware/auth.js
│   │   └── services/
│   │       (db.js, authService.js, auditService.js, flagService.js,
│   │        bootstrapService.js, logger.js)
│   ├── db/
│   │   └── schema.sql          <- plain SQL, applied manually via Neon's console
│   ├── src/                    <- the React app
│   │   ├── components/Logo.jsx
│   │   ├── context/ (RoleContext, FlagContext)
│   │   ├── pages/ (Login, Dashboard, FeatureFlags)
│   │   ├── styles/tokens.js    <- design tokens, incl. brand colours
│   │   └── App.jsx
│   ├── public/                 <- favicon.png, apple-touch-icon.png, waypoint-icon.png
│   ├── vercel.json             <- routes friendly paths to the router files
│   └── package.json
├── tools/                      <- standalone local HTML admin utilities
│   ├── bootstrap-admin.html    (seeds flags + PlatformAdmin, on demand)
│   └── login-test.html         (verifies sign-in end to end)
├── tests/                      <- vitest, run from repo root
└── README.md                   <- setup, deployment, env vars
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
- **Schema:** One plain SQL file (`db/schema.sql`), applied by hand via
  Neon's SQL console — deliberately not a migration library at this
  scale.

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
