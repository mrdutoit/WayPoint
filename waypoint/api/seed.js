import { randomUUID } from 'crypto';
import { withPlatformContext, pool } from './src/db.js';
import { hashPassword } from './src/services/authService.js';
import { setTenantFlag } from './src/services/flagService.js';

// Credentials always come from the environment — never hardcoded, per
// code-nodejs (Database Migrations & Seed). Run once against a fresh
// database: `npm run migrate && npm run seed`.
const ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD;
const ADMIN_FIRST_NAME = process.env.PLATFORM_ADMIN_FIRST_NAME ?? 'Platform';
const ADMIN_LAST_NAME = process.env.PLATFORM_ADMIN_LAST_NAME ?? 'Administrator';

// Platform-wide default flags — see FR-002 and the Requirements document,
// section 4.3/4.5. A tenant-specific row (set later via PATCH /api/flags/:key)
// overrides these per organisation.
const DEFAULT_FLAGS = [
  { flagKey: 'billing.mode', valueType: 'enum', value: 'manual' }, // 'manual' | 'gateway' — FR-021 wording, section 5 decision
  { flagKey: 'auth.sso.enabled', valueType: 'boolean', value: false }, // FR-029
  { flagKey: 'security.fieldEncryption.enabled', valueType: 'boolean', value: false }, // FR-028
  { flagKey: 'ai.settingsMenu.enabled', valueType: 'boolean', value: false }, // FR-022, scaffolded not built
];

async function seed() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      'PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD must be set in the environment before seeding. ' +
      'Never hardcode these — see .env.example.'
    );
  }
  if (ADMIN_PASSWORD.length < 12) {
    throw new Error('PLATFORM_ADMIN_PASSWORD must be at least 12 characters.');
  }

  await withPlatformContext(async (client) => {
    for (const flag of DEFAULT_FLAGS) {
      await setTenantFlag(client, { tenantId: null, ...flag });
      console.log(`Seeded platform flag: ${flag.flagKey} = ${flag.value}`);
    }

    const existing = await client.query(
      `SELECT id FROM okr.user_account WHERE email = $1`,
      [ADMIN_EMAIL.toLowerCase().trim()]
    );
    if (existing.rows.length > 0) {
      console.log(`Platform Administrator ${ADMIN_EMAIL} already exists — skipping.`);
      return;
    }

    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    await client.query(
      `INSERT INTO okr.user_account
         (id, tenant_id, role, email, first_name, last_name, password_hash)
       VALUES ($1, NULL, 'PlatformAdmin', $2, $3, $4, $5)`,
      [randomUUID(), ADMIN_EMAIL.toLowerCase().trim(), ADMIN_FIRST_NAME, ADMIN_LAST_NAME, passwordHash]
    );
    console.log(`Seeded Platform Administrator: ${ADMIN_EMAIL}`);
  });
}

seed()
  .then(() => pool.end())
  .then(() => {
    console.log('Seed complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
