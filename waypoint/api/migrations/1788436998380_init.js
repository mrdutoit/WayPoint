/**
 * Initial schema — Stage 3 scaffold. Deliberately limited to the
 * cross-cutting platform tables: Tenant, UserAccount, FeatureFlag,
 * AuditLog. The OKR domain tables (Objective, KeyResult, Initiative,
 * CheckIn, Reflection, Cycle, ScoringRubric, RubricLevel, BillingAccount,
 * OkrElementConfig, TerminologySetting, CascadeLevel — see the Stage 2
 * Architecture and Design document, section 3) are added in later,
 * numbered migrations as each is built out in Stage 4.
 *
 * Every tenant-scoped table gets Row-Level Security enabled and a policy
 * that checks app.current_tenant_id — set once per request by
 * withTenantContext() in api/src/db.js (FR-010). This is the actual
 * isolation boundary, not just a convention enforced by application code.
 */

export const shorthands = undefined;

export async function up(pgm) {
  pgm.createExtension('pgcrypto', { ifNotExists: true }); // gen_random_uuid()
  pgm.createSchema('okr', { ifNotExists: true });

  // ---------- tenant ----------
  pgm.createTable({ schema: 'okr', name: 'tenant' }, {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    region: { type: 'text', notNull: true, default: 'europe' }, // see Requirements doc, section 4.2
    cascade_level_count: { type: 'integer', notNull: true, default: 4 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- user_account ----------
  pgm.createTable({ schema: 'okr', name: 'user_account' }, {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    // Nullable: a PlatformAdmin is never assigned to a tenant (FR-003).
    tenant_id: { type: 'uuid', references: { schema: 'okr', name: 'tenant' }, onDelete: 'CASCADE' },
    manager_id: { type: 'uuid', references: { schema: 'okr', name: 'user_account' }, onDelete: 'SET NULL' },
    // PlatformAdmin | TenantAdmin | Manager | Employee — see Requirements
    // document, section 3.1. Enforced at the application layer rather than
    // a Postgres enum, so a new role never requires a migration.
    role: { type: 'text', notNull: true },
    email: { type: 'text', notNull: true, unique: true },
    first_name: { type: 'text', notNull: true },
    last_name: { type: 'text', notNull: true },
    password_hash: { type: 'text', notNull: true },
    failed_attempts: { type: 'integer', notNull: true, default: 0 },
    locked_until: { type: 'timestamptz' },
    reset_token_hash: { type: 'text' },
    reset_token_expiry: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex({ schema: 'okr', name: 'user_account' }, 'tenant_id');

  // ---------- feature_flag ----------
  pgm.createTable({ schema: 'okr', name: 'feature_flag' }, {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    // NULL tenant_id = platform-wide default; a tenant-specific row overrides it (see flagService.js)
    tenant_id: { type: 'uuid', references: { schema: 'okr', name: 'tenant' }, onDelete: 'CASCADE' },
    flag_key: { type: 'text', notNull: true },
    value_type: { type: 'text', notNull: true }, // 'boolean' | 'enum'
    value: { type: 'text', notNull: true },
    is_phase2: { type: 'boolean', notNull: true, default: false },
  });
  pgm.addConstraint({ schema: 'okr', name: 'feature_flag' }, 'feature_flag_tenant_key_unique', {
    unique: ['tenant_id', 'flag_key'],
  });
  // Postgres treats every NULL as distinct for a normal unique constraint,
  // so two platform-wide rows (tenant_id IS NULL) with the same flag_key
  // would NOT violate feature_flag_tenant_key_unique above — this partial
  // index is what actually makes platform-wide flags upsert-safe.
  pgm.sql(`
    CREATE UNIQUE INDEX feature_flag_platform_key_unique
      ON okr.feature_flag (flag_key) WHERE tenant_id IS NULL;
  `);

  // ---------- audit_log ----------
  pgm.createTable({ schema: 'okr', name: 'audit_log' }, {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', references: { schema: 'okr', name: 'tenant' }, onDelete: 'SET NULL' }, // nullable: platform-level actions (e.g. tenant creation) have no tenant yet
    actor_id: { type: 'uuid', references: { schema: 'okr', name: 'user_account' }, onDelete: 'SET NULL' },
    action: { type: 'text', notNull: true },
    entity_type: { type: 'text', notNull: true },
    entity_id: { type: 'text' },
    timestamp: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex({ schema: 'okr', name: 'audit_log' }, ['tenant_id', 'timestamp']);

  // ---------- Row-Level Security (FR-010) ----------
  // is_platform_admin is set only inside withPlatformContext() (api/src/db.js),
  // reached only after middleware/auth.js has confirmed the caller's role —
  // these policies are the enforcement boundary, application code is not.
  const tenantScopedTables = ['tenant', 'user_account', 'feature_flag', 'audit_log'];
  for (const table of tenantScopedTables) {
    pgm.sql(`ALTER TABLE okr.${table} ENABLE ROW LEVEL SECURITY;`);
  }

  pgm.sql(`
    CREATE POLICY tenant_isolation ON okr.tenant
      USING (id = current_setting('app.current_tenant_id', true)::uuid
             OR current_setting('app.is_platform_admin', true) = 'true');
  `);
  pgm.sql(`
    CREATE POLICY tenant_isolation ON okr.user_account
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
             OR current_setting('app.is_platform_admin', true) = 'true');
  `);
  pgm.sql(`
    CREATE POLICY tenant_isolation ON okr.feature_flag
      USING (tenant_id IS NULL
             OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
             OR current_setting('app.is_platform_admin', true) = 'true');
  `);
  pgm.sql(`
    CREATE POLICY tenant_isolation ON okr.audit_log
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
             OR current_setting('app.is_platform_admin', true) = 'true');
  `);
}

export async function down(pgm) {
  pgm.dropTable({ schema: 'okr', name: 'audit_log' });
  pgm.dropTable({ schema: 'okr', name: 'feature_flag' });
  pgm.dropTable({ schema: 'okr', name: 'user_account' });
  pgm.dropTable({ schema: 'okr', name: 'tenant' });
  pgm.dropSchema('okr');
}
