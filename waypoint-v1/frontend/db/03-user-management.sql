-- WayPoint schema — Stage 4, user management follow-up to Module 2.
--
-- Apply this once, manually, via your Postgres provider's SQL console,
-- after schema.sql and 02-okr-core.sql.
--
-- Closes a real gap: "Module 1 — Authentication and user management"
-- only ever shipped Authentication in Stage 3. Tenant provisioning
-- (FR-011) and user invite / role management were already specified in
-- the Stage 2 API design table (POST /api/tenants, POST /api/users/invite,
-- PATCH /api/users/:id/role) but never built, which left no way to
-- create a tenant or a user for testing with SSO switched off.

ALTER TABLE okr.user_account
  ADD COLUMN password_must_change boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN okr.user_account.password_must_change IS
  'Set true whenever an admin (Platform or Tenant) sets this account''s
   password directly — first-time account creation or a force-reset.
   The app gates all other screens behind a change-password prompt until
   this is cleared by PUT /api/auth/change-password, so an admin-known
   password is always a one-time bootstrap, never a lasting shared
   secret. Same pattern as MedBroker''s passwordMustChange (§72).';
