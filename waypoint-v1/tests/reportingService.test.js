import { describe, it, expect, vi } from 'vitest';
import { getScorecard, getTeamProgress, getAlignmentMap, getCheckinCompliance } from '../frontend/api-lib/services/reportingService.js';
import { ForbiddenError } from '../frontend/api-lib/services/errors.js';

function mockClient() {
  return { query: vi.fn() };
}

const EMPLOYEE = { id: 'emp-1', role: 'Employee' };
const MANAGER = { id: 'mgr-1', role: 'Manager' };
const TENANT_ADMIN = { id: 'admin-1', role: 'TenantAdmin' };

const NO_CYCLE = { rows: [] };
const CYCLE = { rows: [{ id: 'cycle-1', name: 'Q3 2026', startDate: '2026-07-01', endDate: '2026-09-30' }] };

const PERSON = (managerId = 'mgr-1', id = 'emp-1') => ({ rows: [{ id, firstName: 'Joe', lastName: 'Soap', avatarOption: 'grad', managerId }] });

describe('getScorecard — visibility', () => {
  it('a caller may always view their own scorecard', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(PERSON()).mockResolvedValueOnce(NO_CYCLE);
    const result = await getScorecard(client, 't1', EMPLOYEE, 'emp-1');
    expect(result.objectives).toEqual([]);
  });

  it('TenantAdmin may view anyone\'s scorecard — one subject lookup, then the cycle', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(PERSON('someone-else')).mockResolvedValueOnce(NO_CYCLE);
    await getScorecard(client, 't1', TENANT_ADMIN, 'emp-1');
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('a Manager may view their own direct report\'s scorecard', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(PERSON('mgr-1')).mockResolvedValueOnce(NO_CYCLE);
    const result = await getScorecard(client, 't1', MANAGER, 'emp-1');
    expect(result.objectives).toEqual([]);
  });

  it('refuses a Manager viewing a non-report\'s scorecard', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(PERSON('someone-else'));
    await expect(getScorecard(client, 't1', MANAGER, 'emp-1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses an Employee viewing a colleague\'s scorecard', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(PERSON('mgr-1', 'other-emp'));
    await expect(getScorecard(client, 't1', EMPLOYEE, 'other-emp')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses a non-admin looking up an unknown user as Forbidden, not NotFound — no user enumeration', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(getScorecard(client, 't1', MANAGER, 'ghost')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns the subject\'s name so the page can say whose scorecard it is', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(PERSON()).mockResolvedValueOnce(NO_CYCLE);
    const result = await getScorecard(client, 't1', EMPLOYEE, 'emp-1');
    expect(result.person).toEqual({ id: 'emp-1', firstName: 'Joe', lastName: 'Soap', avatarOption: 'grad' });
  });
});

describe('getScorecard — no active Cycle', () => {
  it('returns an empty scorecard rather than throwing', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(PERSON()).mockResolvedValueOnce(NO_CYCLE);
    const result = await getScorecard(client, 't1', EMPLOYEE, 'emp-1');
    expect(result).toMatchObject({ cycle: null, objectives: [] });
  });
});

describe('getScorecard — assembles Objectives with Key Results and Check-in history', () => {
  it('nests Key Results under each Objective, and check-in history under each Key Result', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce(PERSON())
      .mockResolvedValueOnce(CYCLE)
      .mockResolvedValueOnce({ rows: [{ id: 'obj-1', title: 'Grow revenue', status: 'On Track' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'kr-1', title: 'Sign 10 clients', weighting: '1', status: 'On Track' }] })
      .mockResolvedValueOnce({ rows: [{ confidence: 4, comment: 'Good', submittedAt: '2026-08-01', scoreLabel: 'On Track' }] });

    const result = await getScorecard(client, 't1', EMPLOYEE, 'emp-1');
    expect(result.objectives).toHaveLength(1);
    expect(result.objectives[0].keyResults).toHaveLength(1);
    expect(result.objectives[0].keyResults[0].checkInHistory).toHaveLength(1);
    expect(result.objectives[0].keyResults[0].confidenceTrend).toEqual([{ submittedAt: '2026-08-01', confidence: 4 }]);
  });
});

describe('getTeamProgress', () => {
  it('refuses a non-Manager', async () => {
    await expect(getTeamProgress(mockClient(), 't1', EMPLOYEE)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getTeamProgress(mockClient(), 't1', TENANT_ADMIN)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns an empty list with no active Cycle', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(NO_CYCLE);
    const result = await getTeamProgress(client, 't1', MANAGER);
    expect(result).toEqual({ cycle: null, rows: [] });
  });

  it('scopes the query to the caller\'s own direct reports', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(CYCLE).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await getTeamProgress(client, 't1', MANAGER);
    const rowsCall = client.query.mock.calls[1];
    expect(rowsCall[1]).toEqual(['t1', 'cycle-1', 'mgr-1']);
    expect(rowsCall[0]).toMatch(/u\.manager_id = \$3/);
  });

  it('orders by risk: level_index ascending, then confidence ascending', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(CYCLE).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await getTeamProgress(client, 't1', MANAGER);
    expect(client.query.mock.calls[1][0]).toMatch(/ORDER BY "levelIndex" ASC, "latestConfidence" ASC NULLS FIRST/);
  });

  it('returns this Cycle\'s Check-ins for the caller\'s direct reports only', async () => {
    const client = mockClient();
    const ci = { employeeId: 'emp-1', keyResultId: 'kr-1', submittedAt: '2026-09-01T09:00:00Z', confidence: 4, scoreLabel: 'On Track' };
    client.query
      .mockResolvedValueOnce(CYCLE)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [ci] });
    const result = await getTeamProgress(client, 't1', MANAGER);
    expect(result.checkIns).toEqual([ci]);
    const cadenceCall = client.query.mock.calls[2];
    expect(cadenceCall[1]).toEqual(['t1', 'cycle-1', 'mgr-1']);
    expect(cadenceCall[0]).toMatch(/u\.manager_id = \$3/);
  });
});

describe('getAlignmentMap — opened to every role (was TenantAdmin-only)', () => {
  it('is now accessible to an Employee and a Manager, not just TenantAdmin', async () => {
    const employeeClient = mockClient();
    employeeClient.query.mockResolvedValueOnce(NO_CYCLE);
    await expect(getAlignmentMap(employeeClient, 't1', EMPLOYEE)).resolves.toEqual({ cycle: null, objectives: [] });

    const managerClient = mockClient();
    managerClient.query.mockResolvedValueOnce(NO_CYCLE);
    await expect(getAlignmentMap(managerClient, 't1', MANAGER)).resolves.toEqual({ cycle: null, objectives: [] });
  });

  it('returns a flat list with parentObjectiveId for the frontend to build a tree', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(CYCLE).mockResolvedValueOnce({
      rows: [
        { id: 'obj-1', title: 'Company goal', parentObjectiveId: null, cascadeLevel: 'Company' },
        { id: 'obj-2', title: 'Team goal', parentObjectiveId: 'obj-1', cascadeLevel: 'Team' },
      ],
    });
    const result = await getAlignmentMap(client, 't1', TENANT_ADMIN);
    expect(result.objectives).toHaveLength(2);
    expect(result.objectives[1].parentObjectiveId).toBe('obj-1');
  });
});

describe('getCheckinCompliance', () => {
  it('refuses a non-TenantAdmin', async () => {
    await expect(getCheckinCompliance(mockClient(), 't1', EMPLOYEE)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getCheckinCompliance(mockClient(), 't1', MANAGER)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('groups Key Results by owner', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(CYCLE).mockResolvedValueOnce({
      rows: [
        { employeeId: 'emp-1', employeeFirstName: 'Ada', employeeLastName: 'L', keyResultId: 'kr-1', keyResultTitle: 'A', hasCheckedIn: true },
        { employeeId: 'emp-1', employeeFirstName: 'Ada', employeeLastName: 'L', keyResultId: 'kr-2', keyResultTitle: 'B', hasCheckedIn: false },
        { employeeId: 'emp-2', employeeFirstName: 'Bob', employeeLastName: 'M', keyResultId: 'kr-3', keyResultTitle: 'C', hasCheckedIn: true },
      ],
    }).mockResolvedValueOnce({ rows: [] });
    const result = await getCheckinCompliance(client, 't1', TENANT_ADMIN);
    expect(result.byOwner).toHaveLength(2);
    expect(result.byOwner[0].keyResults).toHaveLength(2);
    expect(result.byOwner[1].keyResults).toHaveLength(1);
  });

  it('attaches per-day check-in counts to the matching owner, for the cadence heatmap (2026-09-18)', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce(CYCLE)
      .mockResolvedValueOnce({
        rows: [{ employeeId: 'emp-1', employeeFirstName: 'Ada', employeeLastName: 'L', keyResultId: 'kr-1', keyResultTitle: 'A', hasCheckedIn: true }],
      })
      .mockResolvedValueOnce({
        rows: [
          { employeeId: 'emp-1', date: '2026-07-02', count: 2 },
          { employeeId: 'emp-1', date: '2026-07-05', count: 1 },
        ],
      });
    const result = await getCheckinCompliance(client, 't1', TENANT_ADMIN);
    expect(result.byOwner[0].checkInsByDate).toEqual([
      { date: '2026-07-02', count: 2 },
      { date: '2026-07-05', count: 1 },
    ]);
  });

  it('ignores a daily-count row for an owner with no Key Results this Cycle rather than crashing (defensive — should not happen given the queries share a WHERE clause, but does not assume it)', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce(CYCLE)
      .mockResolvedValueOnce({ rows: [] }) // no owners with Key Results
      .mockResolvedValueOnce({ rows: [{ employeeId: 'ghost', date: '2026-07-02', count: 1 }] });
    const result = await getCheckinCompliance(client, 't1', TENANT_ADMIN);
    expect(result.byOwner).toEqual([]);
  });

  it('returns an empty list with no active Cycle', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(NO_CYCLE);
    const result = await getCheckinCompliance(client, 't1', TENANT_ADMIN);
    expect(result).toEqual({ cycle: null, byOwner: [] });
  });
});
