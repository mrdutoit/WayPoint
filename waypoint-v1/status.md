# WayPoint — Status

Current state and next steps. This is the part that goes stale — check
dates and re-verify against the actual repo/deployment before trusting
anything here, especially if it's been a while. For the stable
architecture description, see `reference.md` alongside this file.

**Last updated:** as of the Stage 3 scaffold plus branding/alignment
fixes, prior to Stage 4 starting.

## Where things actually stand

- **Stage 1 (Requirements):** Complete.
- **Stage 2 (Architecture & Design):** Complete. Six-persona design
  review done — see the Stage 2 document for findings. Requirements and
  Architecture document is at v0.3.
- **Stage 3 (Scaffold):** Complete and verified working **end to end in
  production** — this is confirmed, not assumed: GlobalAdmin login
  works against the deployed Neon database, feature flags admin page
  works, health check confirms database connectivity.
- **Stage 4 (Full build, module by module):** Not started. This is the
  next step.
- **Pre-Handover Review (security/performance/sizing):** Correctly not
  yet run — per process, this belongs after Stage 4 completes, before
  Stage 5. Not a gap; just not due yet.

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

## What's explicitly NOT built yet

All OKR domain functionality — this is the entire scope of Stage 4:

- Objectives, Key Results (core entities plus cascade)
- Initiatives, Check-ins, Reflections (secondary entities)
- Cycles, scoring rubric
- The primary cascade/scoring workflow
- Billing integration (flag exists, `billing.mode`, nothing wired to it)
- Reporting and dashboards (beyond the current placeholder health check)
- Tenant administration / tenant provisioning (currently manual, no UI)
- SSO (flag exists, `auth.sso.enabled`, not implemented)
- Field-level encryption (flag exists, `security.fieldEncryption.enabled`,
  not implemented — no special personal information is in scope yet per
  Stage 1, so this is correctly deferred, not overdue)

## Next immediate step

Stage 4, Module 1 (Authentication and user management) is effectively
already done as part of the scaffold. Start Stage 4 at the next module —
core OKR entities (Objective, Key Result, Cascade) — against the data
model in the Stage 2 document, section 3. Each module should add its own
SQL to `frontend/db/`, service/router files under
`frontend/api-lib/` and `frontend/api/`, and frontend pages, with tests
shipped as part of the same unit of work, not deferred.

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
