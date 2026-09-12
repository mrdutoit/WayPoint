import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Every other test file in this suite mocks `client.query` entirely,
 * which means none of them can ever catch invalid SQL — a wrong column
 * name, a table alias referenced in RETURNING that was never established
 * in the FROM/INTO clause, a type mismatch. That gap was exactly what
 * shipped createObjective/updateObjective/createKeyResult/updateKeyResult
 * with `RETURNING o.id, ...`/`RETURNING kr.id, ...` on INSERT/UPDATE
 * statements that never aliased the table as `o`/`kr` — 209 passing
 * mocked tests, and it still threw `missing FROM-clause entry for table
 * "o"` the first time a real Postgres connection touched it.
 *
 * MedBroker already learned this lesson ("A local Postgres instance is
 * required for any queries mixing differently-typed columns — a real
 * instance catches type mismatches that manual code reading misses") —
 * applying it here now rather than only after the fact a second time.
 *
 * Gated behind TEST_DATABASE_URL so it skips cleanly wherever a real
 * Postgres isn't available (a typical CI box, this repo's default
 * sandbox) rather than failing the whole suite. To run it for real:
 *   1. A local Postgres 14+ with the btree_gist extension available.
 *   2. createdb waypoint_test
 *   3. TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/waypoint_test npx vitest run tests/integration
 * It applies db/schema.sql fresh into that database every run — point
 * this at a scratch database, never anything with real data.
 */

const hasRealDb = !!process.env.TEST_DATABASE_URL;
const describeIfDb = hasRealDb ? describe : describe.skip;

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, '../../frontend/db/schema.sql');
// Not yet folded into schema.sql (not confirmed applied to Neon yet) —
// applied here too so this suite tests against the full intended
// current-state schema, not a stale snapshot. Remove this once it's
// folded in for real.
const pendingMigrationPath = join(__dirname, '../../frontend/db/migrations/06-user-profile.sql');

let client, pool;

describeIfDb('write paths against real Postgres', () => {
  let tenantId, managerId, employeeId, tenantAdminId, levelId, cadenceId, rubricId, objectiveId, keyResultId;

  beforeAll(async () => {
    // Real pool from db.js, not a hand-rolled pg.Client — so this test
    // automatically inherits any connection-level configuration (like
    // the DATE type parser in db.js) instead of needing to duplicate it
    // and silently drifting out of sync with what production actually
    // does.
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    ({ pool } = await import('../../frontend/api-lib/services/db.js'));
    client = await pool.connect();
    // Fresh schema every run — this file is only ever pointed at a
    // scratch database (see the module comment above).
    await client.query('DROP SCHEMA IF EXISTS okr CASCADE');
    const schemaSql = readFileSync(schemaPath, 'utf8');
    await client.query(schemaSql);
    await client.query(readFileSync(pendingMigrationPath, 'utf8'));
  });

  afterAll(async () => {
    client?.release();
    await pool?.end();
  });

  async function inTenantContext(fn) {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
    await client.query(`SELECT set_config('app.is_platform_admin', 'false', true)`);
    try {
      const result = await fn();
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }

  it('applies schema.sql cleanly with no errors', async () => {
    const { rows } = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'okr' ORDER BY table_name`);
    expect(rows.map((r) => r.table_name)).toEqual([
      'audit_log', 'cadence', 'cascade_level', 'cycle', 'feature_flag',
      'key_result', 'objective', 'okr_element_config', 'rubric_level',
      'scoring_rubric', 'tenant', 'terminology_setting', 'user_account',
    ]);
  });

  it('tenantService.createTenantWithFirstAdmin — real insert, real seeding', async () => {
    const { createTenantWithFirstAdmin } = await import('../../frontend/api-lib/services/tenantService.js');
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.is_platform_admin', 'true', true)`);
    const result = await createTenantWithFirstAdmin(
      client,
      { name: 'Acme', region: 'europe' },
      { email: 'admin@acme.test', firstName: 'Ada', lastName: 'Lovelace', password: 'Correct-Horse-9!' }
    );
    await client.query('COMMIT');
    tenantId = result.tenant.id;
    tenantAdminId = result.tenantAdmin.id;
    expect(result.tenantAdmin.role).toBe('TenantAdmin');

    const { rows: cadences } = await client.query(`SELECT label FROM okr.cadence WHERE tenant_id = $1 ORDER BY months`, [tenantId]);
    expect(cadences.map((c) => c.label)).toEqual(['Monthly', 'Quarterly', 'Bi-Annually', 'Annually']);
  });

  it('userService.inviteUser — real insert with a real manager FK', async () => {
    const { inviteUser } = await import('../../frontend/api-lib/services/userService.js');
    const manager = await inTenantContext(() =>
      inviteUser(client, tenantId, { role: 'Manager', email: 'mgr@acme.test', firstName: 'Grace', lastName: 'Hopper', password: 'Correct-Horse-9!' })
    );
    managerId = manager.id;
    const employee = await inTenantContext(() =>
      inviteUser(client, tenantId, { role: 'Employee', email: 'emp@acme.test', firstName: 'Alan', lastName: 'Turing', password: 'Correct-Horse-9!', managerId })
    );
    employeeId = employee.id;
    expect(employee.role).toBe('Employee');
  });

  it('userService.updateUserRole — real update', async () => {
    const { updateUserRole } = await import('../../frontend/api-lib/services/userService.js');
    const updated = await inTenantContext(() => updateUserRole(client, tenantId, employeeId, 'Manager'));
    expect(updated.role).toBe('Manager');
    await inTenantContext(() => updateUserRole(client, tenantId, employeeId, 'Employee')); // put it back
  });

  it('cascadeLevelService.setCascadeLevelsForTenant — real upsert', async () => {
    const { setCascadeLevelsForTenant } = await import('../../frontend/api-lib/services/cascadeLevelService.js');
    const levels = await inTenantContext(() => setCascadeLevelsForTenant(client, tenantId, ['Company', 'Team']));
    levelId = levels[0].id;
    expect(levels.map((l) => l.label)).toEqual(['Company', 'Team']);
  });

  it('cadenceService.createCadence / updateCadence — real insert and update', async () => {
    const { createCadence, updateCadence } = await import('../../frontend/api-lib/services/cadenceService.js');
    const created = await inTenantContext(() => createCadence(client, tenantId, { label: 'Weekly', months: 1 }));
    cadenceId = created.id;
    const updated = await inTenantContext(() => updateCadence(client, tenantId, cadenceId, { label: 'Weekly', months: 1 }));
    expect(updated.id).toBe(cadenceId);
  });

  it('cycleService.createCycle — real insert, real computed end_date', async () => {
    const { rows: quarterly } = await client.query(`SELECT id FROM okr.cadence WHERE tenant_id = $1 AND label = 'Quarterly'`, [tenantId]);
    const { createCycle } = await import('../../frontend/api-lib/services/cycleService.js');
    const cycle = await inTenantContext(() =>
      createCycle(client, tenantId, { name: 'Q3 2026', cadenceId: quarterly[0].id, startDate: '2026-07-01' })
    );
    expect(cycle.endDate).toBe('2026-09-30');
  });

  it('scoringRubricService.setRubricForTenant — real upsert', async () => {
    const { setRubricForTenant, DEFAULT_RUBRIC_LEVELS } = await import('../../frontend/api-lib/services/scoringRubricService.js');
    const rubric = await inTenantContext(() => setRubricForTenant(client, tenantId, { name: 'Standard', levels: DEFAULT_RUBRIC_LEVELS }));
    rubricId = rubric.id;
    expect(rubric.levels).toHaveLength(4);
  });

  // The exact bug: RETURNING o.id/kr.id on an INSERT/UPDATE that never
  // aliased the table as o/kr. Every mocked test in objectiveService.test.js
  // and keyResultService.test.js passed regardless, because the mock
  // client never actually parses the SQL string.
  it('objectiveService.createObjective — real insert, no "missing FROM-clause entry" error', async () => {
    const { createObjective } = await import('../../frontend/api-lib/services/objectiveService.js');
    const objective = await inTenantContext(() =>
      createObjective(client, tenantId, { id: employeeId, role: 'Employee' }, { title: 'Grow net revenue by 20%', cascadeLevelId: levelId })
    );
    objectiveId = objective.id;
    expect(objective.status).toBe('Not Started');
  });

  it('objectiveService.updateObjective — real update, no "missing FROM-clause entry" error', async () => {
    const { updateObjective } = await import('../../frontend/api-lib/services/objectiveService.js');
    const updated = await inTenantContext(() =>
      updateObjective(client, tenantId, { id: employeeId }, objectiveId, { title: 'Grow net revenue by 25%' })
    );
    expect(updated.title).toBe('Grow net revenue by 25%');
  });

  it('keyResultService.createKeyResult — real insert, no "missing FROM-clause entry" error', async () => {
    const { createKeyResult } = await import('../../frontend/api-lib/services/keyResultService.js');
    const kr = await inTenantContext(() =>
      createKeyResult(client, tenantId, { id: employeeId }, objectiveId, { title: 'Sign 10 new clients' })
    );
    keyResultId = kr.id;
    expect(kr.status).toBe('Not Started');
  });

  it('keyResultService.updateKeyResult — real update, no "missing FROM-clause entry" error', async () => {
    const { updateKeyResult } = await import('../../frontend/api-lib/services/keyResultService.js');
    const updated = await inTenantContext(() =>
      updateKeyResult(client, tenantId, { id: employeeId }, keyResultId, { title: 'Sign 15 new clients', weighting: 2 })
    );
    expect(updated.title).toBe('Sign 15 new clients');
  });

  it('okrElementConfigService.setElementEnabled — real dependency-graph update', async () => {
    const { setElementEnabled } = await import('../../frontend/api-lib/services/okrElementConfigService.js');
    const config = await inTenantContext(() => setElementEnabled(client, tenantId, 'Initiative', true));
    expect(config.Initiative).toBe(true);
    expect(config.KeyResult).toBe(true); // prerequisite auto-enabled
  });

  it('terminologyService.setTerminologyForTenant — real upsert and reset', async () => {
    const { setTerminologyForTenant } = await import('../../frontend/api-lib/services/terminologyService.js');
    const withOverride = await inTenantContext(() => setTerminologyForTenant(client, tenantId, { Objective: 'Goal' }));
    expect(withOverride.Objective).toBe('Goal');
    const reset = await inTenantContext(() => setTerminologyForTenant(client, tenantId, { Objective: '' }));
    expect(reset.Objective).toBe('Objective');
  });

  it('profileService.updateOwnProfile — real update, works for a tenant user', async () => {
    const { updateOwnProfile } = await import('../../frontend/api-lib/services/profileService.js');
    const profile = await inTenantContext(() => updateOwnProfile(client, employeeId, { theme: 'dark', avatarOption: 'teal', timezone: 'Europe/London' }));
    expect(profile.theme).toBe('dark');
    expect(profile.avatarOption).toBe('teal');
    expect(profile.timezone).toBe('Europe/London');
  });

  it('userService.unlockUser — real update, clears lockout without touching password', async () => {
    const { unlockUser } = await import('../../frontend/api-lib/services/userService.js');
    // simulate a lockout directly, then confirm unlockUser actually clears it
    await client.query(`UPDATE okr.user_account SET failed_attempts = 5, locked_until = now() + interval '15 minutes' WHERE id = $1`, [employeeId]);
    await inTenantContext(() => unlockUser(client, tenantId, employeeId));
    const { rows } = await client.query(`SELECT failed_attempts, locked_until FROM okr.user_account WHERE id = $1`, [employeeId]);
    expect(rows[0].failed_attempts).toBe(0);
    expect(rows[0].locked_until).toBeNull();
  });

  it('profileService.updateOwnProfile — real update, works for PlatformAdmin (no tenant)', async () => {
    const { updateOwnProfile } = await import('../../frontend/api-lib/services/profileService.js');
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.is_platform_admin', 'true', true)`);
    const admin = (await client.query(
      `INSERT INTO okr.user_account (role, email, first_name, last_name, password_hash) VALUES ('PlatformAdmin','admin@waypoint.internal','A','B',' ') RETURNING id`
    )).rows[0];
    const profile = await updateOwnProfile(client, admin.id, { theme: 'light' });
    await client.query('COMMIT');
    expect(profile.theme).toBe('light');
  });
});
