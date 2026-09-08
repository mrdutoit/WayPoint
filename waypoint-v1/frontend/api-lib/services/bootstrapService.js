import { randomUUID } from 'crypto';
import { withPlatformContext } from '../context/tenant.js';
import { hashPassword } from './authService.js';
import { setTenantFlag } from './flagService.js';

const DEFAULT_FLAGS = [
  { flagKey: 'billing.mode', valueType: 'enum', value: 'manual' }, // 'manual' | 'gateway' — FR-021
  { flagKey: 'auth.sso.enabled', valueType: 'boolean', value: false }, // FR-029
  { flagKey: 'security.fieldEncryption.enabled', valueType: 'boolean', value: false }, // FR-028
  { flagKey: 'ai.settingsMenu.enabled', valueType: 'boolean', value: false }, // FR-022, scaffolded not built
];

/**
 * Seeds platform-wide default feature flags and the first Platform
 * Administrator account. Safe to call repeatedly — flags upsert, and an
 * existing admin with the same email is left untouched, not duplicated
 * or overwritten. Assumes db/schema.sql has already been applied — this
 * does not create tables, only rows.
 */
export async function seedPlatformDefaults({ email, password, firstName, lastName }) {
  if (!email || !password) {
    throw new Error('email and password are required to seed the Platform Administrator');
  }
  if (password.length < 12) {
    throw new Error('password must be at least 12 characters');
  }

  const result = { flagsSeeded: [], adminCreated: false, adminAlreadyExisted: false };

  await withPlatformContext(async (client) => {
    for (const flagDef of DEFAULT_FLAGS) {
      await setTenantFlag(client, { tenantId: null, ...flagDef });
      result.flagsSeeded.push(flagDef.flagKey);
    }

    const existing = await client.query(
      `SELECT id FROM okr.user_account WHERE email = $1`,
      [email.toLowerCase().trim()]
    );
    if (existing.rows.length > 0) {
      result.adminAlreadyExisted = true;
      return;
    }

    const passwordHash = await hashPassword(password);
    await client.query(
      `INSERT INTO okr.user_account
         (id, tenant_id, role, email, first_name, last_name, password_hash)
       VALUES ($1, NULL, 'PlatformAdmin', $2, $3, $4, $5)`,
      [randomUUID(), email.toLowerCase().trim(), firstName ?? 'Platform', lastName ?? 'Administrator', passwordHash]
    );
    result.adminCreated = true;
  });

  return result;
}
