-- WayPoint schema — self-service user profile (theme + avatar + timezone).
--
-- Apply this once, manually, via your Postgres provider's SQL console,
-- after db/schema.sql. Once confirmed applied, fold it into schema.sql
-- and delete this file — same convention as every prior migration
-- (see reference.md's Schema decision).
--
-- CORRECTED: the previous version of this file re-included `theme` and
-- `avatar_option` in the same ALTER TABLE as the new `timezone` column,
-- without checking whether they'd already been applied — they had (Sep
-- 12, 10:24am), so the ALTER TABLE failed on "column theme already
-- exists", and because a multi-column ALTER TABLE is atomic, `timezone`
-- was never actually created either, even though the app was already
-- deployed expecting it. `ADD COLUMN IF NOT EXISTS` below makes this
-- migration safe to run regardless of which of these three columns (if
-- any) already exist — it will only ever add what's actually missing.

ALTER TABLE okr.user_account
  ADD COLUMN IF NOT EXISTS theme         text NOT NULL DEFAULT 'light',
  ADD COLUMN IF NOT EXISTS avatar_option text NOT NULL DEFAULT 'grad',
  ADD COLUMN IF NOT EXISTS timezone      text NOT NULL DEFAULT 'Africa/Johannesburg';

COMMENT ON COLUMN okr.user_account.theme IS
  'One of the ids in frontend/src/context/ThemeContext.jsx''s THEMES —
   validated at the application layer (profileService.js), not a
   Postgres enum, so adding a theme never requires a schema change.';

COMMENT ON COLUMN okr.user_account.avatar_option IS
  'One of the ids in frontend/src/constants/avatarOptions.js''s
   AVATAR_OPTIONS — the id (a stable colour/gradient choice), not a
   file. Same pattern as MedBroker''s User.avatarColour: no image
   upload, no blob storage, just a picked swatch.';

COMMENT ON COLUMN okr.user_account.timezone IS
  'One of the ids in profileService.js''s TIMEZONE_IDS. A stored
   preference only — WayPoint has not adopted an app-wide "convert
   every displayed timestamp" layer the way MedBroker''s dateFormat.js
   does; that is separate, larger scope than this field.';
