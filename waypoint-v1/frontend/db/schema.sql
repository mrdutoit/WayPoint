-- Waypoint schema — Stage 3 scaffold.
--
-- Apply this once, manually, via your Postgres provider's SQL console
-- (Neon or Supabase both have one in their dashboard). This matches
-- MedBroker's pattern: a plain schema file, not a migration library —
-- appropriate at this scale, and one less dependency to keep working
-- across Vercel deployments. If the schema outgrows a single hand-applied
-- file, that's the point to introduce versioned migrations, not before.
--
-- Deliberately limited to the cross-cutting platform tables: Tenant,
-- UserAccount, FeatureFlag, AuditLog. The OKR domain tables (Objective,
-- KeyResult, Initiative, CheckIn, Reflection, Cycle, ScoringRubric,
-- RubricLevel, BillingAccount, OkrElementConfig, TerminologySetting,
-- CascadeLevel — see the Stage 2 Architecture and Design document,
-- section 3) are added as their own SQL files as each is built out in
-- Stage 4, applied the same way.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
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
CREATE TABLE okr.user_account (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid REFERENCES okr.tenant(id) ON DELETE CASCADE,
  manager_id          uuid REFERENCES okr.user_account(id) ON DELETE SET NULL,
  -- PlatformAdmin | TenantAdmin | Manager | Employee — see Requirements
  -- document, section 3.1. Enforced at the application layer rather than
  -- a Postgres enum, so a new role never requires a schema change.
  role                text NOT NULL,
  email               text NOT NULL UNIQUE,
  first_name          text NOT NULL,
  last_name           text NOT NULL,
  password_hash       text NOT NULL,
  failed_attempts     integer NOT NULL DEFAULT 0,
  locked_until        timestamptz,
  reset_token_hash    text,
  reset_token_expiry  timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
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

-- ---------- Row-Level Security (FR-010) ----------
-- app.is_platform_admin and app.current_tenant_id are set once per request
-- by api-lib/services/db.js — this is the actual isolation boundary,
-- application code is not.
ALTER TABLE okr.tenant       ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.user_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.feature_flag ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.audit_log    ENABLE ROW LEVEL SECURITY;

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
