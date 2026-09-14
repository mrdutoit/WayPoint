-- WayPoint schema — Module 3: Initiative, Check-in, Reflection.
--
-- Apply after schema.sql and every file currently in db/migrations/.
-- Idempotent (IF NOT EXISTS / DO blocks where relevant) per the lesson
-- in reference.md's design decisions — safe to re-run.

-- ---------- initiative ----------
-- FR-026: "Where enabled, a Key Result's owner or their Manager can
-- create Initiatives against it, each with a title, status (Not
-- Started, In Progress, Done), an owner, and an optional due date."
-- status is a fixed three-value enum here (enforced at the application
-- layer, not a Postgres enum) — unlike Objective/KeyResult, whose
-- status is driven by a tenant-configurable rubric, Initiative's three
-- states are given explicitly in FR-026 itself, not tenant-defined.
CREATE TABLE IF NOT EXISTS okr.initiative (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES okr.tenant(id) ON DELETE CASCADE,
  key_result_id  uuid NOT NULL REFERENCES okr.key_result(id) ON DELETE CASCADE,
  owner_id       uuid NOT NULL REFERENCES okr.user_account(id) ON DELETE RESTRICT,
  title          text NOT NULL,
  status         text NOT NULL DEFAULT 'Not Started',
  due_date       date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT initiative_status_valid CHECK (status IN ('Not Started', 'In Progress', 'Done'))
);
CREATE INDEX IF NOT EXISTS initiative_tenant_id_idx ON okr.initiative (tenant_id);
CREATE INDEX IF NOT EXISTS initiative_key_result_id_idx ON okr.initiative (key_result_id);

-- ---------- check_in ----------
-- FR-018: "An Objective or Key Result owner, and where applicable their
-- Manager, can submit a Check-in recording a rubric score, a confidence
-- or sentiment indicator, and optional commentary."
--
-- confidence is a 1-5 integer scale — FR-018 doesn't pin an exact
-- range, only that it exists ("a confidence or sentiment indicator");
-- the Stage 2 design review (Sam) specifies the *control* should be "a
-- low-friction control (icon set or slider), not a dropdown" without
-- specifying the scale itself. 1-5 was chosen to match a 5-icon mood
-- set cleanly — flagged as an inferred choice, not a literal spec
-- requirement, in case a different scale was actually intended.
--
-- tenant_id added beyond the ERD's slimmed view, same reasoning as
-- key_result/rubric_level (FR-010 "every table").
CREATE TABLE IF NOT EXISTS okr.check_in (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES okr.tenant(id) ON DELETE CASCADE,
  key_result_id   uuid NOT NULL REFERENCES okr.key_result(id) ON DELETE CASCADE,
  submitted_by_id uuid NOT NULL REFERENCES okr.user_account(id) ON DELETE RESTRICT,
  rubric_level_id uuid NOT NULL REFERENCES okr.rubric_level(id) ON DELETE RESTRICT,
  confidence      integer NOT NULL,
  comment         text,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_in_confidence_range CHECK (confidence BETWEEN 1 AND 5)
);
CREATE INDEX IF NOT EXISTS check_in_tenant_id_idx ON okr.check_in (tenant_id);
-- "most recent Check-in" (FR-019) is the hot query path for this table.
CREATE INDEX IF NOT EXISTS check_in_key_result_submitted_idx ON okr.check_in (key_result_id, submitted_at DESC);

-- ---------- reflection ----------
-- FR-027: "Where enabled, an Objective's owner or their Manager can
-- submit a Reflection — free-text retrospective commentary — against
-- that Objective, typically at Cycle close."
CREATE TABLE IF NOT EXISTS okr.reflection (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES okr.tenant(id) ON DELETE CASCADE,
  objective_id  uuid NOT NULL REFERENCES okr.objective(id) ON DELETE CASCADE,
  author_id     uuid NOT NULL REFERENCES okr.user_account(id) ON DELETE RESTRICT,
  content       text NOT NULL,
  submitted_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reflection_tenant_id_idx ON okr.reflection (tenant_id);
CREATE INDEX IF NOT EXISTS reflection_objective_submitted_idx ON okr.reflection (objective_id, submitted_at DESC);

-- ---------- Row-Level Security (FR-010) ----------
ALTER TABLE okr.initiative ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.check_in   ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr.reflection ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON okr.initiative
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.is_platform_admin', true) = 'true');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON okr.check_in
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.is_platform_admin', true) = 'true');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON okr.reflection
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.is_platform_admin', true) = 'true');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
