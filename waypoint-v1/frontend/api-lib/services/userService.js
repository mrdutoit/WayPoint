import { hashPassword, checkPasswordComplexity } from './authService.js';
import { ValidationError, ForbiddenError, NotFoundError } from './errors.js';

/**
 * User management — the "and user management" half of Stage 4 Module 1
 * that Stage 3 never actually built (only Authentication shipped). Covers
 * the user-facing half of FR-011 and the API table's GET /api/users,
 * POST /api/users/invite, PATCH /api/users/:id/role. force-password-reset
 * is a deliberate addition beyond the literal table, mirroring MedBroker's
 * equivalent (§118) — flagged in the router file too.
 *
 * Every admin-set password (invite or force-reset) sets
 * password_must_change = true — see db/schema.sql's user_account table.
 * There is
 * no email delivery wired up yet (auth-router.js's own TODO), so an
 * admin-typed temporary password is the only bootstrap mechanism
 * available; forcing an immediate change is what keeps that from being a
 * password only the admin knows, persisting.
 */

const ROLES_TENANT_ADMIN_CAN_ASSIGN = ['Manager', 'Employee'];

export async function listUsersForTenant(client, tenantId) {
  const { rows } = await client.query(
    `SELECT id, manager_id AS "managerId", role, email, first_name AS "firstName",
            last_name AS "lastName", failed_attempts AS "failedAttempts",
            locked_until AS "lockedUntil", created_at AS "createdAt"
     FROM okr.user_account
     WHERE tenant_id = $1
     ORDER BY created_at ASC`,
    [tenantId]
  );
  return rows;
}

/**
 * TenantAdmin inviting a Manager or Employee (FR: API table,
 * POST /api/users/invite). `managerId`, if given, must be an existing
 * user in the same tenant — used for FR-020 visibility and FR-015
 * ownership assignment once Objectives are involved.
 */
export async function inviteUser(client, tenantId, { role, email, firstName, lastName, password, managerId }) {
  if (!ROLES_TENANT_ADMIN_CAN_ASSIGN.includes(role)) {
    throw new ValidationError(`role must be one of: ${ROLES_TENANT_ADMIN_CAN_ASSIGN.join(', ')}`);
  }
  if (!email?.trim()) throw new ValidationError('email is required');
  if (!firstName?.trim()) throw new ValidationError('firstName is required');
  if (!lastName?.trim()) throw new ValidationError('lastName is required');
  if (!password) throw new ValidationError('password is required');
  const passwordProblems = checkPasswordComplexity(password);
  if (passwordProblems.length > 0) throw new ValidationError(passwordProblems.join('; '));

  if (managerId) {
    const { rows } = await client.query(
      `SELECT id FROM okr.user_account WHERE tenant_id = $1 AND id = $2`,
      [tenantId, managerId]
    );
    if (rows.length === 0) throw new ValidationError('managerId does not exist in this tenant');
  }

  const passwordHash = await hashPassword(password);
  const { rows } = await client.query(
    `INSERT INTO okr.user_account (id, tenant_id, manager_id, role, email, first_name, last_name, password_hash, password_must_change)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, true)
     RETURNING id, manager_id AS "managerId", role, email, first_name AS "firstName", last_name AS "lastName", created_at AS "createdAt"`,
    [tenantId, managerId ?? null, role, email.toLowerCase().trim(), firstName.trim(), lastName.trim(), passwordHash]
  );
  return rows[0];
}

export async function updateUserRole(client, tenantId, userId, newRole) {
  if (!ROLES_TENANT_ADMIN_CAN_ASSIGN.includes(newRole)) {
    throw new ValidationError(`role must be one of: ${ROLES_TENANT_ADMIN_CAN_ASSIGN.join(', ')}`);
  }
  const { rows: existing } = await client.query(
    `SELECT id, role FROM okr.user_account WHERE tenant_id = $1 AND id = $2`,
    [tenantId, userId]
  );
  if (existing.length === 0) throw new NotFoundError('User not found');
  if (existing[0].role === 'TenantAdmin') {
    // Not literally an FR, but changing the tenant's own admin's role
    // through this endpoint has no safe recovery path yet (no second
    // TenantAdmin-management UI) — refuse rather than let a TenantAdmin
    // accidentally lock themselves out of their own tenant.
    throw new ForbiddenError('Cannot change a TenantAdmin\'s role through this endpoint');
  }

  const { rows } = await client.query(
    `UPDATE okr.user_account SET role = $3 WHERE tenant_id = $1 AND id = $2
     RETURNING id, manager_id AS "managerId", role, email, first_name AS "firstName", last_name AS "lastName"`,
    [tenantId, userId, newRole]
  );
  return rows[0];
}

/**
 * Beyond the literal Stage 2 API table (deliberate addition — see the
 * router file). Mirrors MedBroker's force-password-reset (§118): an
 * admin-set password always forces a change at next login, and this
 * also clears any lockout, since forgetting a password and triggering
 * the lockout threshold in the same session is the exact case this
 * exists for.
 */
export async function forcePasswordResetForUser(client, tenantId, userId, newPassword) {
  const { rows: existing } = await client.query(
    `SELECT id, role FROM okr.user_account WHERE tenant_id = $1 AND id = $2`,
    [tenantId, userId]
  );
  if (existing.length === 0) throw new NotFoundError('User not found');
  if (existing[0].role === 'TenantAdmin') {
    throw new ForbiddenError('Cannot force-reset a TenantAdmin\'s password through this endpoint');
  }

  const passwordProblems = checkPasswordComplexity(newPassword);
  if (passwordProblems.length > 0) throw new ValidationError(passwordProblems.join('; '));

  const passwordHash = await hashPassword(newPassword);
  const { rows } = await client.query(
    `UPDATE okr.user_account
     SET password_hash = $3, password_must_change = true, failed_attempts = 0, locked_until = NULL
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, email`,
    [tenantId, userId, passwordHash]
  );
  return rows[0];
}

/**
 * MedBroker's UserAdmin.jsx separates "unlock" from "force-password-
 * reset" (onUnlock vs. onForcePasswordReset) — an admin who can see a
 * user is simply locked out from too many failed attempts, and knows
 * they still remember their password, shouldn't be forced into typing
 * them a brand new one. Clears the lockout only; password_hash and
 * password_must_change are untouched.
 */
export async function unlockUser(client, tenantId, userId) {
  const { rows: existing } = await client.query(
    `SELECT id, role FROM okr.user_account WHERE tenant_id = $1 AND id = $2`,
    [tenantId, userId]
  );
  if (existing.length === 0) throw new NotFoundError('User not found');
  if (existing[0].role === 'TenantAdmin') {
    throw new ForbiddenError('Cannot unlock a TenantAdmin\'s account through this endpoint');
  }

  const { rows } = await client.query(
    `UPDATE okr.user_account SET failed_attempts = 0, locked_until = NULL
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, email`,
    [tenantId, userId]
  );
  return rows[0];
}
