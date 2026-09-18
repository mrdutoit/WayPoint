-- 2026-09-18: add entity_label and changes to audit_log
-- Apply this once against Neon via the SQL console, then delete this
-- file from the repo — schema.sql already reflects the folded-in state.

ALTER TABLE okr.audit_log ADD COLUMN entity_label text;
ALTER TABLE okr.audit_log ADD COLUMN changes jsonb;
