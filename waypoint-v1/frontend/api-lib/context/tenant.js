import { pool } from '../services/db.js';

/**
 * The single chokepoint referenced in FR-010: every tenant-scoped query
 * in this application must go through this function. It sets a
 * session-local Postgres variable that every Row-Level Security policy
 * on a tenant-scoped table checks (see db/schema.sql) — a query that
 * does not go through here simply cannot see any tenant's data, by
 * construction, not by convention.
 *
 * Usage:
 *   const rows = await withTenantContext(tenantId, (client) =>
 *     client.query('SELECT * FROM okr.user_account WHERE id = $1', [userId])
 *   );
 */
export async function withTenantContext(tenantId, fn) {
  if (!tenantId) {
    throw new Error('withTenantContext called without a tenantId — refusing to run an unscoped tenant query');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // set_config(..., true) is scoped to the current transaction, same as
    // SET LOCAL, but — unlike SET LOCAL — accepts a parameterised value,
    // so a malformed or hostile tenantId can never be interpreted as SQL.
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
    await client.query(`SELECT set_config('app.is_platform_admin', 'false', true)`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * For Platform Administrator requests only (FR-003) — tenant
 * provisioning, cross-tenant flag management, the bootstrap endpoint.
 * Row-Level Security policies explicitly allow access when
 * app.is_platform_admin is true; this is never the default path and must
 * only be reached after middleware/auth.js has confirmed the caller's
 * role is PlatformAdmin (or, for bootstrap specifically, the shared
 * secret has been verified).
 */
export async function withPlatformContext(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.is_platform_admin', 'true', true)`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
