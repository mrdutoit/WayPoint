# Waypoint — Stage 3 Scaffold

OKR tracking platform. This is the **scaffold**, not the full application —
the cross-cutting foundations every module depends on, plus the mandatory
platform tables (Tenant, UserAccount, FeatureFlag, AuditLog). The OKR
domain itself (Objectives, Key Results, Initiatives, Check-ins, Reflections,
Cycles) is built module by module in Stage 4, against the design in the
Stage 2 "Architecture and Design" document.

Working name "Waypoint" — not yet confirmed, low-cost to rename later
(see `frontend/package.json`, `api/package.json`, `frontend/index.html`).

## Structure

```
waypoint/
├── frontend/        React (Vite) SPA
├── api/              Express API — one Vercel Function, all routes
├── tests/            Vitest — mirrors api/src/
└── README.md         this file
```

## Local setup

Requires Node 18+ and a local PostgreSQL instance (or a free-tier Neon/Supabase project).

```bash
# 1. API
cd api
npm install
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET, FRONTEND_ORIGIN
npm run migrate
PLATFORM_ADMIN_EMAIL=you@example.com PLATFORM_ADMIN_PASSWORD='at-least-12-characters' npm run seed
npm run dev                 # http://localhost:3001

# 2. Frontend (separate terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173, proxies /api to :3001

# 3. Tests (from repo root)
npm install
npm test
```

## Environment variables (api/.env)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `JWT_SECRET` | Yes | Random string, 32+ characters |
| `FRONTEND_ORIGIN` | Yes | e.g. `http://localhost:5173` in dev |
| `PORT` | No | Defaults to 3001 |
| `LOG_LEVEL` | No | Defaults to `info` |
| `AWS_KMS_KEY_ID` | No | Only needed once `security.fieldEncryption.enabled` is turned on for a tenant |
| `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` | Vercel only | Read automatically at build time — see "Creating the Platform Administrator" below. Never commit these. |
| `BOOTSTRAP_SECRET` | No | Only needed for the optional manual re-trigger endpoint — see below |

## Creating the Platform Administrator

This runs automatically on every deployment — there's no separate script
to remember to run.

1. In the **api** Vercel project → Settings → Environment Variables, add
   `PLATFORM_ADMIN_EMAIL` and `PLATFORM_ADMIN_PASSWORD` (12+ characters),
   alongside `DATABASE_URL`, `JWT_SECRET`, and `FRONTEND_ORIGIN`.
2. Deploy (or redeploy). `api/vercel.json` sets `buildCommand: npm run
   build`, which runs `api/scripts/deploy-bootstrap.js` as part of every
   deployment: it applies any pending migration, then seeds the platform
   feature flags and your Platform Administrator account from those two
   variables. Check the deployment's Build Logs for lines prefixed
   `[bootstrap]` to confirm it ran.
3. Sign in at your frontend URL with that email and password.

Safe on every subsequent deploy too — both steps are idempotent
(`api/src/services/bootstrapService.js`), so a redeploy after the admin
already exists just confirms nothing needs to change and moves on. If
`PLATFORM_ADMIN_EMAIL`/`PASSWORD` aren't set yet (e.g. your very first
deploy, before you've configured them), the build logs a line saying so
and continues — it does not fail the deployment, so you're never locked
out of shipping other changes while you sort out credentials.

**Alternative, without a redeploy:** `GET /api/admin/bootstrap` runs the
exact same logic on demand, protected by a `BOOTSTRAP_SECRET` header —
useful if you want to re-trigger it (e.g. after changing
`PLATFORM_ADMIN_PASSWORD`) without waiting for the next deploy. The
easiest way to call it is `tools/bootstrap-admin.html` — see below.

## Local tools (no build, no server, just open in a browser)

Two standalone pages in `tools/` — double-click to open, no npm install,
no dev server. Each is a single self-contained HTML file with its own
inline styling and script; neither depends on anything else in this repo
at runtime.

- **`bootstrap-admin.html`** — a form for the API URL and
  `BOOTSTRAP_SECRET`, with a button that calls `/api/admin/bootstrap` and
  shows the result. The friendlier alternative to the DevTools console
  snippet above.
- **`login-test.html`** — a form for the API URL, email, and password,
  with a button that calls `/api/auth/login` and decodes the returned
  token locally to show the role, tenant, and expiry it carries. Useful
  for confirming sign-in works end to end before the real frontend is
  wired up to anything, or after adding a new user.

Both remember the API URL you last used (via `localStorage`, entirely
local to your browser) but never save the secret or password. Both are
plain files — safe to commit, safe to keep around, nothing sensitive
lives inside them.

Because these are opened as local files rather than served from the
configured frontend origin, `/api/admin/bootstrap` and `/api/auth/login`
carry an open CORS policy rather than the frontend-restricted one every
other route uses — see the comment in `api/index.js` for why that's a
deliberate, narrow exception rather than a general loosening.

## Deploying to Vercel

Two separate Vercel projects against this one repository, each with its
own **Root Directory** setting (Project Settings → General → Root Directory):

1. **Frontend project** — Root Directory: `frontend`. Framework preset:
   Vite. Add `VITE_API_BASE_URL` pointing at the API project's URL, and
   `VITE_AUTH_CONFIGURED=1` once real authentication is wired up (leave
   unset for a preview deployment — the app falls back to mock data, per
   the preview-safe pattern in `frontend/src/services/api.js`).
2. **API project** — Root Directory: `api`. Add the environment variables
   from the table above. Migrations and admin seeding run automatically on
   every deployment (see "Creating the Platform Administrator" below) —
   no manual step required, even for the first deploy.

Both projects deploy from the same `main` branch. A pull request creates
a preview deployment of each independently.

## Feature flags

Platform-wide defaults are seeded by `api/seed.js`:

| Flag | Type | Default | Reference |
|---|---|---|---|
| `billing.mode` | enum | `manual` | FR-021 |
| `auth.sso.enabled` | boolean | `false` | FR-029 |
| `security.fieldEncryption.enabled` | boolean | `false` | FR-028 |
| `ai.settingsMenu.enabled` | boolean | `false` | FR-022 |

A Platform Administrator can override any flag per tenant from the Feature
Flags page (`/admin/flags`), or platform-wide via the same page when no
tenant is selected. See the Stage 2 Architecture and Design document,
section 3, for the full functional requirement list (FR-001 through
FR-033).

## What's next (Stage 4)

Module 1 (Authentication and user management) is already scaffolded here.
Remaining modules, in build order: core OKR entities (Objective, Key
Result, Cascade), secondary entities (Initiative, Check-in, Reflection),
the primary cascade/scoring workflow, billing integration, reporting and
dashboards, tenant administration. Each module ships with its own
migration, service, tests, and frontend pages — see the Stage 2 document
for the full API design table.
