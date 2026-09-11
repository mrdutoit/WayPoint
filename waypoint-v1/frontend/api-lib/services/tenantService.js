import { hashPassword, checkPasswordComplexity } from './authService.js';
import { ValidationError, NotFoundError } from './errors.js';
import { DEFAULT_CADENCES } from './cadenceService.js';
import { ALL_ELEMENTS } from './okrElementConfigService.js';

/**
 * Tenant provisioning (FR-011): "A Platform Administrator can create a
 * new tenant organisation, assign it a database region, and invite its
 * first Tenant Administrator." Both inserts happen in the same
 * withPlatformContext transaction (see tenants-router.js) — the tenant
 * row and its first user are created together, or neither is, rather
 * than leaving a tenant with no admin able to sign in if the second
 * insert ever failed independently.
 *
 * Self-service sign-up and per-tenant region routing are both correctly
 * out of scope (FR-011, Requirements doc roadmap) — `region` here is a
 * label on the tenant row, not a live infrastructure choice.
 */

export async function listTenants(client) {
  const { rows } = await client.query(
    `SELECT id, name, region, cascade_level_count AS "cascadeLevelCount", created_at AS "createdAt"
     FROM okr.tenant
     ORDER BY created_at DESC`
  );
  return rows;
}

export async function getTenant(client, tenantId) {
  const { rows } = await client.query(
    `SELECT id, name, region, cascade_level_count AS "cascadeLevelCount", created_at AS "createdAt"
     FROM okr.tenant WHERE id = $1`,
    [tenantId]
  );
  if (rows.length === 0) throw new NotFoundError('Tenant not found');
  return rows[0];
}

export async function createTenantWithFirstAdmin(client, { name, region }, { email, firstName, lastName, password }) {
  if (!name?.trim()) throw new ValidationError('name is required');
  if (!email?.trim()) throw new ValidationError('email is required');
  if (!firstName?.trim()) throw new ValidationError('firstName is required');
  if (!lastName?.trim()) throw new ValidationError('lastName is required');
  if (!password) throw new ValidationError('password is required');
  const passwordProblems = checkPasswordComplexity(password);
  if (passwordProblems.length > 0) throw new ValidationError(passwordProblems.join('; '));

  const { rows: tenantRows } = await client.query(
    `INSERT INTO okr.tenant (id, name, region)
     VALUES (gen_random_uuid(), $1, $2)
     RETURNING id, name, region, cascade_level_count AS "cascadeLevelCount", created_at AS "createdAt"`,
    [name.trim(), region?.trim() || 'europe']
  );
  const tenant = tenantRows[0];

  const passwordHash = await hashPassword(password);
  const { rows: userRows } = await client.query(
    `INSERT INTO okr.user_account (id, tenant_id, role, email, first_name, last_name, password_hash, password_must_change)
     VALUES (gen_random_uuid(), $1, 'TenantAdmin', $2, $3, $4, $5, true)
     RETURNING id, role, email, first_name AS "firstName", last_name AS "lastName"`,
    [tenant.id, email.toLowerCase().trim(), firstName.trim(), lastName.trim(), passwordHash]
  );

  // Seeded so a TenantAdmin can create a Cycle immediately without first
  // having to set up Cadences from nothing — still fully editable/
  // deletable afterward via /api/settings/cadences, same as everything
  // else seeded at this stage (cf. no cascade levels or rubric seeded —
  // those have no sensible universal default the way Monthly/Quarterly/
  // Bi-Annually/Annually do).
  for (const { label, months } of DEFAULT_CADENCES) {
    await client.query(
      `INSERT INTO okr.cadence (id, tenant_id, label, months) VALUES (gen_random_uuid(), $1, $2, $3)`,
      [tenant.id, label, months]
    );
  }

  // All five OKR elements enabled by default (FR-025) — Initiative/
  // CheckIn/Reflection have no functional effect yet (Module 3), same
  // "scaffolded ahead of use" reasoning as FR-022's AI Settings menu.
  for (const elementKey of ALL_ELEMENTS) {
    await client.query(
      `INSERT INTO okr.okr_element_config (id, tenant_id, element_key, is_enabled) VALUES (gen_random_uuid(), $1, $2, true)`,
      [tenant.id, elementKey]
    );
  }

  return { tenant, tenantAdmin: userRows[0] };
}
