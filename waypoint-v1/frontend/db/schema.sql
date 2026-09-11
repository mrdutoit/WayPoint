-- WayPoint schema — current-state reference.
--
-- Apply this once, manually, via your Postgres provider's SQL console
-- (Neon or Supabase both have one in their dashboard). This matches
-- MedBroker's pattern: a plain schema file, not a migration library —
-- appropriate at this scale, and one less dependency to keep working
-- across Vercel deployments.
--
-- This file always describes what's *actually* live, not a running
-- history of how it got there. When a schema change ships, it's
-- applied by hand via a short-lived migration file (see any file
-- currently sitting in this same folder alongside this one — if one
-- exists, it hasn't been applied and folded in here yet), then this
-- file is rewritten to include it directly and the migration file is
-- deleted from the repo. Never leave an applied migration file lying
-- around once its change is reflected here.

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist; -- needed for the tenant_id equality term in okr.cycle's EXCLUDE constraint below
CREATE SCHEMA IF NOT EXISTS okr;

-- ---------- tenant ----------
CREATE TABLE okr.tenant (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  region               text NOT NULL DEFAULT 'europe', -- see Requirements doc, section 4.2
  cascade_level_count  integer NOT NULL DEFAULT 4,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ---------- user_account ----------
-- tenant_id is nullable: a PlatformAdmin is never assigned to a tenant
-- (FR-003). Every code path touching this table must handle that case
-- explicitly rather than assuming a tenant always exists — this was a
-- real bug caught mid-build the first time round; documented here so it
-- isn't reintroduced.
--
-- password_must_change: set true whenever an admin (Platform or Tenant)
-- sets this account's password directly — first-time account creation
-- or a force-reset. The app gates all other screens behind a
-- change-password prompt until this is cleared by
-- PUT /api/auth/change-password, so an admin-known password is always a
-- one-time bootstrap, never a lasting shared secret. Same pattern as
-- MedBroker's passwordMustChange (§72).
CREATE TABLE okr.user_account (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid REFERENCES okr.tenant(id) ON DELETE CASCADE,
  manager_id            uuid REFERENCES okr.user_account(id) ON DELETE SET NULL,
  -- PlatformAdmin | TenantAdmin | Manager | Employee — see Requirements
  -- document, section 3.1. Enforced at the application layer rather than
  -- a Postgres enum, so a new role never requires a schema change.
  role                  text NOT NULL,
  email                 text NOT NULL UNIQUE,
  first_name            text NOT NULL,
  last_name             text NOT NULL,
  password_hash         text NOT NULL,
  password_must_change  boolean NOT NULL DEFAULT false,
  failed_attempts       integer NOT NULL DEFAULT 0,
  locked_until          timestamptz,
  reset_token_hash      text,
  reset_token_expiry    timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON okr.user_account (tenant_id);

-- ---------- feature_flag ----------
-- NULL tenant_id = platform-wide default; a tenant-specific row overrides
-- it (see api-lib/services/flagService.js). Two unique constraints because
-- Postgres treats every NULL as distinct under a normal unique constraint —
-- the partial index below is what actually makes platform-wide flags
-- upsert-safe.
CREATE TABLE okr.feature_flag (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES okr.tenant(id) ON DELETE CASCADE,
  flag_key    text NOT NULL,
  value_type  text NOT NULL, -- 'boolean' | 'enum'
  value       text NOT NULL,
  is_phase2   boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX feature_flag_tenant_key_unique ON okr.feature_flag (tenant_id, flag_key);
CREATE UNIQUE INDEX feature_flag_platform_key_unique ON okr.feature_flag (flag_key) WHERE tenant_id IS NULL;

-- ---------- audit_log ----------
CREATE TABLE okr.audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid REFERENCES okr.tenant(id) ON DELETE SET NULL, -- nullable: platform-level actions (e.g. tenant creation) have no tenant yet
  actor_id     uuid REFERENCES okr.user_account(id) ON DELETE SET NULL,
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    text,
  "timestamp"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON okr.audit_log (tenant_id, "timestamp");

-- ---------- cascade_level ----------
-- FR-012: 1–4 levels per tenant, TenantAdmin-configurable label per
-- level. tenant.cascade_level_count (above) is the authoritative count;
-- these rows are the actual per-level records that
-- objective.cascade_level_id references. Reconfiguration (PUT
-- /api/settings/cascade-levels) upserts by level_index rather than
-- delete-and-recreate, so existing Objective references never dangle —
-- see api-lib/services/cascadeLevelService.js.
CREATE TABLE okr.cascade_level (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES okr.tenant(id) ON DELETE CASCADE,
  level_index  integer NOT NULL, -- 1 = top of the cascade (e.g. Company)
  label        text NOT NULL,
  CONSTRAINT cascade_level_index_range CHECK (level_index BETWEEN 1 AND 4)
);
CREATE UNIQUE INDEX ON okr.cascade_level (tenant_id, level_index);

-- ---------- cadence ----------
-- TenantAdmin-configurable: Monthly/Quarterly/Bi-Annually/Annually are
-- seeded defaults on tenant creation (see tenantService.js), not a fixed
-- enum. A cadence already used by a Cycle is locked (see
-- cadenceService.js's assertCadenceNotInUse) — both editing months and
-- deleting are refused once in use, not just deletion, so "Quarterly"
-- can never quietly start meaning something different for cycles
-- created after an edit than the ones created before it. Renaming the
-- label alone would be safe to allow even after use (it doesn't change
-- any already-computed end_date), but the simpler, single locked/
-- unlocked rule was chosen over that nuance — flagged in case the
-- distinction turns out to matter in practice.
CREATE TABLE okr.cadence (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES okr.tenant(id) ON DELETE CASCADE,
  label      text NOT NULL,
  months     integer NOT NULL,
  CONSTRAINT cadence_months_positive CHECK (months > 0)
);
CREATE UNIQUE INDEX ON okr.cadence (tenant_id, label);
CREATE INDEX ON okr.cadence (tenant_id);

-- ---------- cycle ----------
-- FR-014, reworked after testing feedback: "active" is computed from
-- today's date falling within [start_date, end_date], not a manually
-- toggled flag — there is no activate action. end_date is always
-- server-computed from start_date + the chosen Cadence's months
-- (api-lib/services/dateMath.js), never accepted from the caller. No two
-- Cycles in a tenant may cover the same day — enforced at the database
-- layer via the EXCLUDE constraint below (needs btree_gist for the
-- tenant_id equality term), not just application validation, so it
-- holds even against a concurrent create. That's what makes "the active
-- Cycle" (singular) safe to depend on without an is_active column.
CREATE TABLE okr.cycle (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES okr.tenant(id) ON DELETE CASCADE,
  cadence_id  uuid NOT NULL REFERENCES okr.cadence(id) ON DELETE RESTRICT,
  name        text NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cycle_dates_valid CHECK (end_date > start_date)
);
CREATE INDEX ON okr.cycle (tenant_id);
ALTER TABLE okr.cycle ADD CONSTRAINT cycle_no_overlapping_dates
  EXCLUDE USING gist (tenant_id WITH =, daterange(start_date, end_date, '[]') WITH &&);

-- ---------- scoring_rubric ----------
-- FR-017: "a scoring rubric... used to score every Key Result in that
-- tenant" (singular). Modelled as one-to-many at the schema level, same
-- as the Stage 2 ERD, but api-lib/services/scoringRubricService.js
-- currently treats it as get-or-create-one-per-tenant to match FR-017's
-- wording — flagged in case multi-rubric support was actually intended.
CREATE TABLE okr.scoring_rubric (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES okr.tenant(id) ON DELETE CASCADE,
  name        text NOT NULL
);
CREATE INDEX ON okr.scoring_rubric (tenant_id);

-- ---------- rubric_level ----------
-- FR-017: four or five ordered levels (e.g. Off Track, At Risk, On
-- Track, Achieved — see styles/tokens.js STATUS_META, seeded with
-- exactly this set as the frontend's default display meta).
CREATE TABLE okr.rubric_level (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES okr.tenant(id) ON DELETE CASCADE,
  rubric_id    uuid NOT NULL REFERENCES okr.scoring_rubric(id) ON DELETE CASCADE,
  level_index  integer NOT NULL, -- ordering, 1 = lowest (worst) rubric level
  label        text NOT NULL,
  CONSTRAINT rubric_level_index_range CHECK (level_index BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX ON okr.rubric_level (rubric_id, level_index);
CREATE INDEX ON okr.rubric_level (tenant_id);

-- ---------- objective ----------
-- Status is never client-writable (FR-004) — always server-computed.
-- Defaults to 'Not Started' per FR-024 ("An Objective with no Key
-- Results has no computed score and is flagged 'Not Started' rather
-- than defaulting to a rubric level"). Full FR-019 roll-up (weighted
-- average of Key Result scores once Check-ins exist) ships with Module
-- 3 — see api-lib/services/objectiveService.js for the extension point.
--
-- parent_objective_id: FR-015 cascade link to "a parent Objective at the
-- level above". FR-023 (no self-ancestry / no cascade cycle) is enforced
-- at the application layer, per the Stage 2 design review finding it was
-- added against — see objectiveService.js — not a DB constraint, since
-- Postgres CHECK constraints cannot express a recursive-ancestry rule.
CREATE TABLE okr.objective (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES okr.tenant(id) ON DELETE CASCADE,
  cycle_id             uuid NOT NULL REFERENCES okr.cycle(id) ON DELETE RESTRICT,
  cascade_level_id     uuid NOT NULL REFERENCES okr.cascade_level(id) ON DELETE RESTRICT,
  parent_objective_id  uuid REFERENCES okr.objective(id) ON DELETE SET NULL,
  owner_id             uuid NOT NULL REFERENCES okr.user_account(id) ON DELETE RESTRICT,
  title                text NOT NULL,
  status               text NOT NULL DEFAULT 'Not Started',
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON okr.objective (tenant_id);
CREATE INDEX ON okr.objective (cycle_id);
CREATE INDEX ON okr.objective (cascade_level_id);
CREATE INDEX ON okr.objective (parent_objective_id);
CREATE INDEX ON okr.objective (owner_id);

-- ---------- key_result ----------
-- Weighting is free-form and normalised at roll-up calculation time
-- (FR-016, Stage 2 design review — Alex), not required to sum to a fixed
-- total, hence no CHECK beyond "positive". Status defaults and roll-up
-- follow the same FR-004/FR-019/FR-024 rules as Objective, above.
CREATE TABLE okr.key_result (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES okr.tenant(id) ON DELETE CASCADE,
  objective_id  uuid NOT NULL REFERENCES okr.objective(id) ON DELETE CASCADE,
  rubric_id     uuid NOT NULL REFERENCES okr.scoring_rubric(id) ON DELETE RESTRICT,
  title         text NOT NULL,
  weighting     numeric(6,2) NOT NULL DEFAULT 1,
  status        text NOT NULL DEFAULT 'Not Started',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT key_result_weighting_positive CHECK (weighting > 0)
);
CREATE INDEX ON okr.key_result (tenant_id);
CREATE INDEX ON okr.key_result (objective_id, rubric_id); -- roll-up query performance, per Stage 2 design review (Alex)

-- ---------- okr_element_config (FR-025) ----------
-- Objective is always enabled and never appears disabled — enforced at
-- the application layer (cannot be disabled at all, not just "requires
-- no enabled dependents"), not by omitting a row for it. Seeded true for
-- every element on every new tenant (see tenantService.js) — Initiative/
-- CheckIn/Reflection toggling has no functional effect yet, since those
-- entities don't exist until Module 3; the config is being established
-- ahead of the functionality it will govern, same pattern as FR-022's
-- AI Settings scaffold.
CREATE TABLE okr.okr_element_config (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES okr.tenant(id) ON DELETE CASCADE,
  element_key  text NOT NULL, -- 'Objective' | 'KeyResult' | 'Initiative' | 'CheckIn' | 'Reflection'
  is_enabled   boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX ON okr.okr_element_config (tenant_id, element_key);
CREATE INDEX ON okr.okr_element_config (tenant_id);

-- ---------- terminology_setting (FR-013) ----------
-- No row = use the default English term (Objective, Key Result, Cycle,
-- Check-in, Initiative, Reflection — see terminologyService.js). Nothing
-- seeded on tenant creation; absence IS the default state.
CREATE TABLE okr.terminology_setting (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES okr.tenant(id) ON DELETE CASCADE,
  term_key      text NOT NULL, -- 'Objective' | 'KeyResult' | 'Cycle' | 'CheckIn' | 'Initiative' | 'Reflection'
  custom_label  text NOT NULL
);
CREATE UNIQUE INDEX ON okr.terminology_setting (tenant_id, term_key);
CREATE INDEX ON okr.terminology_setting (tenant_id);

-- ---------- Row-Level Security (FR-010) ----------
-- app.is_platform_admin and app.current_tenant_id are set once per
-- request by api-lib/context/tenant.js — this is the actual isolation
-- boundary, application code is not.
ALTER TABLE okr.tenant                ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.user_account          ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.feature_flag          ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.audit_log             ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.cascade_level         ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.cadence               ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.cycle                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.scoring_rubric        ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.rubric_level          ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.objective             ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.key_result            ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.okr_element_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.terminology_setting   ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON okr.tenant
  USING (id = current_setting('app.current_tenant_id', true)::uuid
         OR current_setting('app.is_platform_admin', true) = 'true');

CREATE POLICY tenant_isolation ON okr.user_account
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR current_setting('app.is_platform_admin', true) = 'true');

CREATE POLICY tenant_isolation ON okr.feature_flag
  USING (tenant_id IS NULL
         OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR current_setting('app.is_platform_admin', true) = 'true');

CREATE POLICY tenant_isolation ON okr.audit_log
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR current_setting('app.is_platform_admin', true) = 'true');

CREATE POLICY tenant_isolation ON okr.cascade_level
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR current_setting('app.is_platform_admin', true) = 'true');

CREATE POLICY tenant_isolation ON okr.cadence
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR current_setting('app.is_platform_admin', true) = 'true');

CREATE POLICY tenant_isolation ON okr.cycle
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR current_setting('app.is_platform_admin', true) = 'true');

CREATE POLICY tenant_isolation ON okr.scoring_rubric
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR current_setting('app.is_platform_admin', true) = 'true');

CREATE POLICY tenant_isolation ON okr.rubric_level
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR current_setting('app.is_platform_admin', true) = 'true');

CREATE POLICY tenant_isolation ON okr.objective
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR current_setting('app.is_platform_admin', true) = 'true');

CREATE POLICY tenant_isolation ON okr.key_result
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR current_setting('app.is_platform_admin', true) = 'true');

CREATE POLICY tenant_isolation ON okr.okr_element_config
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR current_setting('app.is_platform_admin', true) = 'true');

CREATE POLICY tenant_isolation ON okr.terminology_setting
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR current_setting('app.is_platform_admin', true) = 'true');
