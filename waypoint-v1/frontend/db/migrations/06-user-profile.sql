-- WayPoint schema — self-service user profile (theme + avatar + timezone).
--
-- Apply this once, manually, via your Postgres provider's SQL console,
-- after db/schema.sql. Once confirmed applied, fold it into schema.sql
-- and delete this file — same convention as every prior migration
-- (see reference.md's Schema decision).

ALTER TABLE okr.user_account
  ADD COLUMN theme         text NOT NULL DEFAULT 'light',
  ADD COLUMN avatar_option text NOT NULL DEFAULT 'grad',
  ADD COLUMN timezone      text NOT NULL DEFAULT 'Africa/Johannesburg';

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
