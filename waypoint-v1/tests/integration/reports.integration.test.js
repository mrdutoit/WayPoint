import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Reporting's queries (multi-table JOINs, a LATERAL subquery, GROUP-BY-
 * style aggregation done in JS after the query) are exactly the class
 * of SQL mocked tests cannot validate — see writes.integration.test.js's
 * own module comment for why this methodology exists at all. Same
 * TEST_DATABASE_URL gate, same "point at a scratch database only" rule.
 */

const hasRealDb = !!process.env.TEST_DATABASE_URL;
const describeIfDb = hasRealDb ? describe : describe.skip;

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, '../../frontend/db/schema.sql');

let client, pool;

describeIfDb('reporting queries against real Postgres', () => {
  let tenantId, managerId, employeeId, otherEmployeeId, companyLevelId, teamLevelId, rubricId, onTrackLevelId, offTrackLevelId;
  let companyObjectiveId, teamObjectiveId, krWithCheckInId, krWithoutCheckInId;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    ({ pool } = await import('../../frontend/api-lib/services/db.js'));
    client = await pool.connect();
    await client.query('DROP SCHEMA IF EXISTS okr CASCADE');
    await client.query(readFileSync(schemaPath, 'utf8'));

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

    const { createTenantWithFirstAdmin } = await import('../../frontend/api-lib/services/tenantService.js');
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.is_platform_admin', 'true', true)`);
    const tenantResult = await createTenantWithFirstAdmin(
      client, { name: 'Acme' },
      { email: 'admin@acme.test', firstName: 'Ada', lastName: 'Admin', password: 'Correct-Horse-9!' }
    );
    await client.query('COMMIT');
    tenantId = tenantResult.tenant.id;

    const { inviteUser } = await import('../../frontend/api-lib/services/userService.js');
    const manager = await inTenantContext(() => inviteUser(client, tenantId, { role: 'Manager', email: 'mgr@acme.test', firstName: 'Grace', lastName: 'Manager', password: 'Correct-Horse-9!' }));
    managerId = manager.id;
    const employee = await inTenantContext(() => inviteUser(client, tenantId, { role: 'Employee', email: 'emp@acme.test', firstName: 'Alan', lastName: 'Employee', password: 'Correct-Horse-9!', managerId }));
    employeeId = employee.id;
    const otherEmployee = await inTenantContext(() => inviteUser(client, tenantId, { role: 'Employee', email: 'other@acme.test', firstName: 'Grace2', lastName: 'Other', password: 'Correct-Horse-9!', managerId }));
    otherEmployeeId = otherEmployee.id;

    const { setCascadeLevelsForTenant } = await import('../../frontend/api-lib/services/cascadeLevelService.js');
    const levels = await inTenantContext(() => setCascadeLevelsForTenant(client, tenantId, ['Company', 'Team']));
    companyLevelId = levels[0].id;
    teamLevelId = levels[1].id;

    const { rows: quarterly } = await client.query(`SELECT id FROM okr.cadence WHERE tenant_id = $1 AND label = 'Quarterly'`, [tenantId]);
    const { createCycle } = await import('../../frontend/api-lib/services/cycleService.js');
    await inTenantContext(() => createCycle(client, tenantId, { name: 'Q3 2026', cadenceId: quarterly[0].id, startDate: '2026-07-01' }));

    const { setRubricForTenant, DEFAULT_RUBRIC_LEVELS } = await import('../../frontend/api-lib/services/scoringRubricService.js');
    const rubric = await inTenantContext(() => setRubricForTenant(client, tenantId, { name: 'Standard', levels: DEFAULT_RUBRIC_LEVELS }));
    rubricId = rubric.id;
    const { rows: onTrack } = await client.query(`SELECT id FROM okr.rubric_level WHERE rubric_id = $1 AND label = 'On Track'`, [rubricId]);
    onTrackLevelId = onTrack[0].id;
    const { rows: offTrack } = await client.query(`SELECT id FROM okr.rubric_level WHERE rubric_id = $1 AND label = 'Off Track'`, [rubricId]);
    offTrackLevelId = offTrack[0].id;

    const { createObjective } = await import('../../frontend/api-lib/services/objectiveService.js');
    const { createKeyResult } = await import('../../frontend/api-lib/services/keyResultService.js');
    const { createCheckIn } = await import('../../frontend/api-lib/services/checkInService.js');

    const companyObjective = await inTenantContext(() =>
      createObjective(client, tenantId, { id: managerId, role: 'Manager' }, { title: 'Grow the business', cascadeLevelId: companyLevelId })
    );
    companyObjectiveId = companyObjective.id;

    const teamObjective = await inTenantContext(() =>
      createObjective(client, tenantId, { id: employeeId, role: 'Employee' },
        { title: 'Sign more enterprise clients', cascadeLevelId: teamLevelId, parentObjectiveId: companyObjectiveId })
    );
    teamObjectiveId = teamObjective.id;

    const krWithCheckIn = await inTenantContext(() => createKeyResult(client, tenantId, { id: employeeId }, teamObjectiveId, { title: 'Sign 10 clients' }));
    krWithCheckInId = krWithCheckIn.id;
    const krWithoutCheckIn = await inTenantContext(() => createKeyResult(client, tenantId, { id: employeeId }, teamObjectiveId, { title: 'Sign 5 renewals' }));
    krWithoutCheckInId = krWithoutCheckIn.id;

    await inTenantContext(() => createCheckIn(client, tenantId, { id: employeeId }, krWithCheckInId, { rubricLevelId: onTrackLevelId, confidence: 4 }));
    // A second Key Result on the SAME Objective, deliberately never checked in — proves
    // getCheckinCompliance correctly reports both true and false within one owner's list.

    // A second Employee (otherEmployeeId) with a lower-scored Objective, to prove
    // getTeamProgress's risk ordering picks the worse one first across the whole team.
    const otherObjective = await inTenantContext(() =>
      createObjective(client, tenantId, { id: otherEmployeeId, role: 'Employee' }, { title: 'Reduce churn', cascadeLevelId: teamLevelId })
    );
    const otherKr = await inTenantContext(() => createKeyResult(client, tenantId, { id: otherEmployeeId }, otherObjective.id, { title: 'Cut churn to 2%' }));
    await inTenantContext(() => createCheckIn(client, tenantId, { id: otherEmployeeId }, otherKr.id, { rubricLevelId: offTrackLevelId, confidence: 1 }));
  });

  afterAll(async () => {
    client?.release();
    await pool?.end();
  });

  it('getScorecard — real fetch, nests Key Results and Check-in history correctly', async () => {
    const { getScorecard } = await import('../../frontend/api-lib/services/reportingService.js');
    const result = await getScorecard(client, tenantId, { id: employeeId, role: 'Employee' }, employeeId);
    expect(result.cycle.name).toBe('Q3 2026');
    expect(result.objectives).toHaveLength(1);
    expect(result.objectives[0].keyResults).toHaveLength(2);
    const scoredKr = result.objectives[0].keyResults.find((kr) => kr.id === krWithCheckInId);
    expect(scoredKr.status).toBe('On Track');
    expect(scoredKr.checkInHistory).toHaveLength(1);
    expect(scoredKr.confidenceTrend[0].confidence).toBe(4);
  });

  it('getScorecard — a Manager can view their direct report\'s scorecard, a stranger cannot', async () => {
    const { getScorecard } = await import('../../frontend/api-lib/services/reportingService.js');
    const asManager = await getScorecard(client, tenantId, { id: managerId, role: 'Manager' }, employeeId);
    expect(asManager.objectives).toHaveLength(1);

    await expect(
      getScorecard(client, tenantId, { id: otherEmployeeId, role: 'Employee' }, employeeId)
    ).rejects.toThrow(/own scorecard/i);
  });

  it('getTeamProgress — real fetch, the worse-scored direct report\'s Key Result sorts first', async () => {
    const { getTeamProgress } = await import('../../frontend/api-lib/services/reportingService.js');
    const result = await getTeamProgress(client, tenantId, { id: managerId, role: 'Manager' });
    // Both employees report to managerId — otherEmployee's "Off Track" (level 1)
    // Key Result must sort before employeeId's "On Track" (level 3) and the
    // never-checked-in Key Result (level 0, worst of all).
    expect(result.rows[0].status === 'Not Started' || result.rows[0].status === 'Off Track').toBe(true);
    const statuses = result.rows.map((r) => r.status);
    expect(statuses).toContain('On Track');
    expect(statuses).toContain('Off Track');
    expect(statuses).toContain('Not Started');
  });

  it('getAlignmentMap — real fetch, the Team Objective correctly points at its Company parent', async () => {
    const { getAlignmentMap } = await import('../../frontend/api-lib/services/reportingService.js');
    const result = await getAlignmentMap(client, tenantId, { id: 'admin', role: 'TenantAdmin' });
    const teamRow = result.objectives.find((o) => o.id === teamObjectiveId);
    const companyRow = result.objectives.find((o) => o.id === companyObjectiveId);
    expect(teamRow.parentObjectiveId).toBe(companyObjectiveId);
    expect(companyRow.parentObjectiveId).toBeNull();
    expect(teamRow.cascadeLevel).toBe('Team');
    expect(companyRow.cascadeLevel).toBe('Company');
  });

  it('getAlignmentMap — real fetch, now genuinely accessible to a non-TenantAdmin (was TenantAdmin-only)', async () => {
    const { getAlignmentMap } = await import('../../frontend/api-lib/services/reportingService.js');
    const result = await getAlignmentMap(client, tenantId, { id: employeeId, role: 'Employee' });
    expect(result.objectives.length).toBeGreaterThan(0);
  });

  it('getCheckinCompliance — real fetch, correctly reports true and false within one owner', async () => {
    const { getCheckinCompliance } = await import('../../frontend/api-lib/services/reportingService.js');
    const result = await getCheckinCompliance(client, tenantId, { id: 'admin', role: 'TenantAdmin' });
    const employeeGroup = result.byOwner.find((o) => o.employeeId === employeeId);
    const checkedIn = employeeGroup.keyResults.find((kr) => kr.keyResultId === krWithCheckInId);
    const notCheckedIn = employeeGroup.keyResults.find((kr) => kr.keyResultId === krWithoutCheckInId);
    expect(checkedIn.hasCheckedIn).toBe(true);
    expect(notCheckedIn.hasCheckedIn).toBe(false);
  });
});
