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
| `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` | Seed only | Never commit these — pass as one-off environment variables when running `npm run seed` |

## Deploying to Vercel

Two separate Vercel projects against this one repository, each with its
own **Root Directory** setting (Project Settings → General → Root Directory):

1. **Frontend project** — Root Directory: `frontend`. Framework preset:
   Vite. Add `VITE_API_BASE_URL` pointing at the API project's URL, and
   `VITE_AUTH_CONFIGURED=1` once real authentication is wired up (leave
   unset for a preview deployment — the app falls back to mock data, per
   the preview-safe pattern in `frontend/src/services/api.js`).
2. **API project** — Root Directory: `api`. Add the environment variables
   from the table above. Run `npm run migrate` against the production
   database before the first deploy (Vercel does not run this
   automatically).

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
