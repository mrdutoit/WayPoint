# WayPoint — Stage 3 Scaffold

OKR tracking platform. This is the **scaffold** — the cross-cutting
foundations every module depends on, plus the mandatory platform tables
(Tenant, UserAccount, FeatureFlag, AuditLog). The OKR domain itself
(Objectives, Key Results, Initiatives, Check-ins, Reflections, Cycles) is
built module by module in Stage 4, against the design in the Stage 2
"Architecture and Design" document.

**One Vercel project.** Frontend and API are colocated — `api/` and
`api-lib/` both live inside `frontend/`, deployed together as a single
project. `api/` holds thin router files, one per domain area; each file
under `api/` becomes its own Vercel Function automatically. `api-lib/`
holds the actual logic (services, middleware, tenant context) that those
router files import — it is never deployed directly. This mirrors the
proven MedBroker pattern rather than the two-project split an earlier
version of this scaffold used.

## Structure

```
waypoint-v1/
├── frontend/                  <- the one Vercel project (Root Directory: waypoint-v1/frontend)
│   ├── api/                   <- thin router files, each its own Vercel Function
│   │   ├── health.js
│   │   ├── auth-router.js     (login, password reset)
│   │   ├── flags-router.js    (list/update feature flags)
│   │   └── admin-router.js    (on-demand bootstrap)
│   ├── api-lib/                <- the real logic, never deployed directly
│   │   ├── config.js
│   │   ├── context/tenant.js   (Row-Level Security chokepoint - FR-010)
│   │   ├── middleware/auth.js
│   │   └── services/
│   ├── db/
│   │   └── schema.sql          <- apply manually via your Postgres provider's SQL console
│   ├── src/                    <- the React app
│   ├── vercel.json             <- routes friendly paths to the router files
│   └── package.json
├── tools/                      <- standalone local HTML utilities, no build step
│   ├── bootstrap-admin.html
│   └── login-test.html
├── tests/                      <- vitest, run from the repo root
└── README.md
```

## Local setup

Requires Node 18+.

```bash
# 1. Frontend
cd frontend
npm install
npm run dev          # http://localhost:5173 - frontend only, see note below

# 2. Tests (from repo root)
npm install
npm test
```

**Note on local API testing:** because `api/` is deployed as Vercel
Functions, there's no local server for it outside Vercel's own tooling
(`vercel dev`, which needs the Vercel CLI). If that's not available,
test the API against the deployed environment using `tools/` instead.
`npm test` still fully exercises the service logic locally (password
hashing, JWT, lockout, the bootstrap auth guard) without needing a live
database or a running server.

## Setting up the database

1. Create a Postgres database (Neon or Supabase).
2. Open its SQL console and paste in the entire contents of
   `frontend/db/schema.sql`. Run it once. This creates the tables and the
   Row-Level Security policies - nothing here is applied automatically.
3. Keep the connection string - that's `DATABASE_URL`.

## Environment variables

Set these in the Vercel project (Settings -> Environment Variables):

| Variable | Required | Type | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | Secret | From the step above |
| `JWT_SECRET` | Yes | Secret | Random string, 32+ characters |
| `PLATFORM_ADMIN_EMAIL` | For bootstrap | Config | Your email |
| `PLATFORM_ADMIN_PASSWORD` | For bootstrap | Secret | 12+ characters |
| `BOOTSTRAP_SECRET` | For bootstrap | Secret | Any long random string |
| `AWS_KMS_KEY_ID` | No | Secret | Only once `security.fieldEncryption.enabled` is on for a tenant |

## Creating the Platform Administrator

No automatic hook - this runs on demand, matching how MedBroker does it.

1. Set `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`, and
   `BOOTSTRAP_SECRET` in Vercel, and make sure `db/schema.sql` has already
   been applied (above).
2. Open `tools/bootstrap-admin.html` locally (double-click - no server,
   no build). Enter your deployed site's URL and the bootstrap secret.
   Click Run Bootstrap.
3. Sign in - either through the real app, or with `tools/login-test.html`
   to confirm the token and role come back correctly first.

Safe to run step 2 more than once - seeding is idempotent. Consider
removing `BOOTSTRAP_SECRET` from Vercel afterward; with it unset, the
endpoint refuses every request rather than allowing one through.

## Deploying to Vercel

One project. Import the repository, set **Root Directory** to
`waypoint-v1/frontend`, framework preset Vite. Add the environment
variables above, deploy.

## Feature flags

| Flag | Type | Default | Reference |
|---|---|---|---|
| `billing.mode` | enum | `manual` | FR-021 |
| `auth.sso.enabled` | boolean | `false` | FR-029 |
| `security.fieldEncryption.enabled` | boolean | `false` | FR-028 |
| `ai.settingsMenu.enabled` | boolean | `false` | FR-022 |

A Platform Administrator can override any flag per tenant from the
Feature Flags page (`/admin/flags`), or platform-wide when no tenant is
selected. See the Stage 2 Architecture and Design document, section 3,
for the full functional requirement list.

## What's next (Stage 4)

Module 1 (Authentication and user management) is scaffolded here.
Remaining modules, in build order: core OKR entities (Objective, Key
Result, Cascade), secondary entities (Initiative, Check-in, Reflection),
the primary cascade/scoring workflow, billing integration, reporting and
dashboards, tenant administration. Each new module adds its own SQL file
to `frontend/db/` (applied the same manual way), service and router files
under `frontend/api-lib/` and `frontend/api/`, and frontend pages - see
the Stage 2 document for the full API design table.
