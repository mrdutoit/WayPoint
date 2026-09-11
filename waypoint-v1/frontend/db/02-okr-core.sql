-- WayPoint schema — Stage 4, Module 2 (Core OKR entities: Objective, Key
-- Result, Cascade).
--
-- Apply this once, manually, via your Postgres provider's SQL console,
-- after db/schema.sql. Same plain-SQL-file pattern as Stage 3 — see the
-- header note in schema.sql for why.
--
-- Covers: CascadeLevel (FR-012), Cycle (FR-014), ScoringRubric +
-- RubricLevel (FR-017), Objective (FR-004, FR-015, FR-019 partial,
-- FR-020, FR-023, FR-024), KeyResult (FR-004, FR-016, FR-019 partial,
-- FR-024). See the Stage 2 Architecture and Design document, section 3,
-- for the source data model.
--
-- Two deliberate additions beyond the literal ERD (section 3.3/3.4),
-- both to satisfy FR-010 ("every table carries a tenantId"): the ERD's
-- slimmed diagram view omits tenantId from KEY_RESULT and RUBRIC_LEVEL
-- (it says explicitly that fields shown are only "relevant to that
-- view"), but every other tenant-scoped table in this build carries the
-- column directly rather than relying on a join for RLS, and FR-010 says
-- "every table" without qualification. Both get a direct tenant_id
-- column here for the same reason audit_log does in schema.sql, even
-- though it is also derivable via a join to their parent row.

-- ---------- cascade_level ----------
-- FR-012: 1–4 levels per tenant, TenantAdmin-configurable label per
-- level. tenant.cascade_level_count (schema.sql) is the authoritative
-- count; these rows are the actual per-level records that
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

-- ---------- cycle ----------
-- FR-014: configurable start/end/cadence; only one Cycle may be marked
-- active per tenant at a time — enforced here at the database layer via
-- a partial unique index, not just application logic, so it holds even
-- against a concurrent request.
CREATE TABLE okr.cycle (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES okr.tenant(id) ON DELETE CASCADE,
  name        text NOT NULL,
  cadence     text NOT NULL, -- free-text label (e.g. 'Quarterly') — tenant-defined, not an enum
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  is_active   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cycle_dates_valid CHECK (end_date > start_date)
);
CREATE INDEX ON okr.cycle (tenant_id);
CREATE UNIQUE INDEX cycle_one_active_per_tenant ON okr.cycle (tenant_id) WHERE is_active;

-- ---------- scoring_rubric ----------
-- FR-017: "a scoring rubric... used to score every Key Result in that
-- tenant" (singular). Modelled as one-to-many at the schema level, same
-- as the ERD, but api-lib/services/scoringRubricService.js currently
-- treats it as get-or-create-one-per-tenant to match FR-017's wording —
-- flagged in the module delivery notes in case multi-rubric support was
-- actually intended.
CREATE TABLE okr.scoring_rubric (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES okr.tenant(id) ON DELETE CASCADE,
  name        text NOT NULL
);
CREATE INDEX ON okr.scoring_rubric (tenant_id);

-- ---------- rubric_level ----------
-- FR-017: four or five ordered levels (e.g. Off Track, At Risk, On
-- Track, Achieved — see styles/tokens.js STATUS_META, already seeded
-- with exactly this set as the frontend's default display meta).
-- tenant_id added beyond the ERD's slimmed view — see header note.
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
-- total, hence no CHECK beyond "positive". tenant_id added beyond the
-- ERD's slimmed view — see header note. Status defaults and roll-up
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

-- ---------- Row-Level Security (FR-010) ----------
ALTER TABLE okr.cascade_level  ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.cycle          ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.scoring_rubric ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.rubric_level   ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.objective      ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.key_result     ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON okr.cascade_level
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
