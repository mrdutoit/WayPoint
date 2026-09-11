-- WayPoint schema — Cadence entity + Cycle rework.
--
-- Apply this once, manually, via your Postgres provider's SQL console,
-- after schema.sql, 02-okr-core.sql, and 03-user-management.sql.
--
-- Supersedes part of FR-014 based on direct feedback while testing
-- Module 2: a Cycle's "active" status is now computed from today's date
-- falling within [start_date, end_date], not a manually-toggled flag —
-- POST /api/cycles/:id/activate is retired. Cadence (Monthly/Quarterly/
-- Bi-Annually/Annually, tenant-editable) becomes its own entity so
-- end_date can be computed server-side from start_date + cadence,
-- instead of typed by hand.
--
-- ============================================================
-- STEP 0 — read before running. This migration changes the shape of
-- okr.cycle, which may already have rows in it if you created any while
-- testing (e.g. "Q3 2026" from the OKR Settings screen). Steps 1–3
-- backfill those rows automatically by matching their old free-text
-- cadence label against the newly-seeded defaults, but that only works
-- if the label matches exactly (case-sensitive) one of Monthly /
-- Quarterly / Bi-Annually / Annually. Run the verification SELECT after
-- step 3 before proceeding to step 4 — if it returns any rows, resolve
-- them by hand (an UPDATE picking the right cadence_id) before running
-- the rest, or just delete those test cycles and recreate them under
-- the new model if they were only ever test data.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist; -- needed for the tenant_id equality term in the EXCLUDE constraint below

-- ---------- cadence ----------
-- TenantAdmin-configurable: Monthly/Quarterly/Bi-Annually/Annually are
-- seeded defaults (step 1 below, and on every new tenant going forward —
-- see tenantService.js), not a fixed enum. A cadence that's already used
-- by a Cycle is locked (see cadenceService.js's assertCadenceNotInUse) —
-- both editing months and deleting are refused once in use, not just
-- deletion, so "Quarterly" can never quietly start meaning something
-- different for cycles created after the edit than the ones created
-- before it. Renaming the label alone would be safe to allow even after
-- use (it doesn't change any already-computed end_date), but the
-- simpler, single locked/unlocked rule was chosen over that nuance —
-- flagged here in case the distinction turns out to matter in practice.
CREATE TABLE okr.cadence (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES okr.tenant(id) ON DELETE CASCADE,
  label      text NOT NULL,
  months     integer NOT NULL,
  CONSTRAINT cadence_months_positive CHECK (months > 0)
);
CREATE UNIQUE INDEX ON okr.cadence (tenant_id, label);
CREATE INDEX ON okr.cadence (tenant_id);

ALTER TABLE okr.cadence ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON okr.cadence
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR current_setting('app.is_platform_admin', true) = 'true');

-- ---------- STEP 1: seed default cadences for every existing tenant ----------
INSERT INTO okr.cadence (id, tenant_id, label, months)
SELECT gen_random_uuid(), t.id, v.label, v.months
FROM okr.tenant t
CROSS JOIN (VALUES ('Monthly', 1), ('Quarterly', 3), ('Bi-Annually', 6), ('Annually', 12)) AS v(label, months)
ON CONFLICT (tenant_id, label) DO NOTHING;

-- ---------- STEP 2: add cadence_id, nullable for now ----------
ALTER TABLE okr.cycle ADD COLUMN cadence_id uuid REFERENCES okr.cadence(id) ON DELETE RESTRICT;

-- ---------- STEP 3: backfill existing cycles by matching the old free-text label ----------
UPDATE okr.cycle c
SET cadence_id = cd.id
FROM okr.cadence cd
WHERE cd.tenant_id = c.tenant_id AND cd.label = c.cadence AND c.cadence_id IS NULL;

-- VERIFY before continuing — this must return zero rows:
--   SELECT id, tenant_id, name, cadence FROM okr.cycle WHERE cadence_id IS NULL;
-- If it doesn't, either UPDATE those rows by hand to a real cadence_id,
-- or DELETE them if they were only test data, before running step 4.

-- ---------- STEP 4: finish the cutover (only after the verification above is clean) ----------
ALTER TABLE okr.cycle ALTER COLUMN cadence_id SET NOT NULL;
ALTER TABLE okr.cycle DROP CONSTRAINT cycle_dates_valid;
ALTER TABLE okr.cycle ADD CONSTRAINT cycle_dates_valid CHECK (end_date > start_date);
DROP INDEX IF EXISTS okr.cycle_one_active_per_tenant;
ALTER TABLE okr.cycle DROP COLUMN is_active;
ALTER TABLE okr.cycle DROP COLUMN cadence;

-- No two Cycles in the same tenant may cover the same day — this is what
-- "the active Cycle" (singular) actually depends on now that activity is
-- computed from today's date rather than a manually-exclusive flag.
-- Enforced at the database layer, not just application validation, so it
-- holds even against a concurrent create.
ALTER TABLE okr.cycle ADD CONSTRAINT cycle_no_overlapping_dates
  EXCLUDE USING gist (tenant_id WITH =, daterange(start_date, end_date, '[]') WITH &&);
