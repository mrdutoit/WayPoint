-- WayPoint schema — self-service user profile (theme + avatar).
--
-- Apply this once, manually, via your Postgres provider's SQL console,
-- after db/schema.sql. Once confirmed applied, fold it into schema.sql
-- and delete this file — same convention as every prior migration this
-- round (see reference.md's Schema decision).

ALTER TABLE okr.user_account
  ADD COLUMN theme         text NOT NULL DEFAULT 'light',
  ADD COLUMN avatar_option text NOT NULL DEFAULT 'grad';

COMMENT ON COLUMN okr.user_account.theme IS
  'One of the ids in frontend/src/context/ThemeContext.jsx''s THEMES —
   validated at the application layer (profileService.js), not a
   Postgres enum, so adding a theme never requires a schema change.';

COMMENT ON COLUMN okr.user_account.avatar_option IS
  'One of the ids in frontend/src/constants/avatarOptions.js''s
   AVATAR_OPTIONS — the id (a stable colour/gradient choice), not a
   file. Same pattern as MedBroker''s User.avatarColour: no image
   upload, no blob storage, just a picked swatch.';
