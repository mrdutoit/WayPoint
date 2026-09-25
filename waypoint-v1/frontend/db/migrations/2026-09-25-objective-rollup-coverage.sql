-- 2026-09-25: roll-up coverage on Objectives — how many of an Objective's
-- inputs (its own Key Results + its linked child Objectives) have reported
-- anything yet. Lets the UI say "2 of 3 reporting" beside a roll-up status,
-- which is a health reading of what's been reported so far, not a
-- completion measure. Written by scoringService.recomputeObjectiveStatus.
--
-- Apply once in Neon's SQL console, then run "Recompute all OKR statuses"
-- from tools/bootstrap-admin.html to fill the new columns for existing
-- Objectives. Already folded into schema.sql — delete this file from
-- GitHub after applying.

ALTER TABLE okr.objective ADD COLUMN IF NOT EXISTS inputs_reporting integer NOT NULL DEFAULT 0;
ALTER TABLE okr.objective ADD COLUMN IF NOT EXISTS inputs_total     integer NOT NULL DEFAULT 0;
