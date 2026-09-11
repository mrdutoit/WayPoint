-- WayPoint schema — pulled forward from Module 7 (Administration) at
-- Mark's request while testing Module 2: FR-013 (terminology renaming)
-- and FR-025 (OKR element enable/disable). Apply after schema.sql,
-- 02-okr-core.sql, 03-user-management.sql, and
-- 04-cadence-and-cycle-rework.sql.

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

ALTER TABLE okr.okr_element_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON okr.okr_element_config
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR current_setting('app.is_platform_admin', true) = 'true');

-- Seed all five elements enabled for every existing tenant (new tenants
-- get this via tenantService.js going forward).
INSERT INTO okr.okr_element_config (id, tenant_id, element_key, is_enabled)
SELECT gen_random_uuid(), t.id, v.element_key, true
FROM okr.tenant t
CROSS JOIN (VALUES ('Objective'), ('KeyResult'), ('Initiative'), ('CheckIn'), ('Reflection')) AS v(element_key)
ON CONFLICT (tenant_id, element_key) DO NOTHING;

-- ---------- terminology_setting (FR-013) ----------
-- No row = use the default English term (Objective, Key Result, Cycle,
-- Check-in, Initiative, Reflection — see terminologyService.js). Nothing
-- to seed on tenant creation; absence IS the default state.
CREATE TABLE okr.terminology_setting (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES okr.tenant(id) ON DELETE CASCADE,
  term_key      text NOT NULL, -- 'Objective' | 'KeyResult' | 'Cycle' | 'CheckIn' | 'Initiative' | 'Reflection'
  custom_label  text NOT NULL
);
CREATE UNIQUE INDEX ON okr.terminology_setting (tenant_id, term_key);
CREATE INDEX ON okr.terminology_setting (tenant_id);

ALTER TABLE okr.terminology_setting ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON okr.terminology_setting
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR current_setting('app.is_platform_admin', true) = 'true');
