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

describe('getScorecard — visibility', () => {
  it('a caller may always view their own scorecard', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(NO_CYCLE);
    const result = await getScorecard(client, 't1', EMPLOYEE, 'emp-1');
    expect(result.objectives).toEqual([]);
  });

  it('TenantAdmin may view anyone\'s scorecard, no manager lookup needed', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(NO_CYCLE);
    await getScorecard(client, 't1', TENANT_ADMIN, 'emp-1');
    expect(client.query).toHaveBeenCalledTimes(1); // straight to the cycle lookup, no ownership check query
  });

  it('a Manager may view their own direct report\'s scorecard', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ managerId: 'mgr-1' }] })
      .mockResolvedValueOnce(NO_CYCLE);
    const result = await getScorecard(client, 't1', MANAGER, 'emp-1');
    expect(result.objectives).toEqual([]);
  });

  it('refuses a Manager viewing a non-report\'s scorecard', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ managerId: 'someone-else' }] });
    await expect(getScorecard(client, 't1', MANAGER, 'emp-1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses an Employee viewing a colleague\'s scorecard', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ managerId: 'mgr-1' }] });
    await expect(getScorecard(client, 't1', EMPLOYEE, 'other-emp')).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('getScorecard — no active Cycle', () => {
  it('returns an empty scorecard rather than throwing', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(NO_CYCLE);
    const result = await getScorecard(client, 't1', EMPLOYEE, 'emp-1');
    expect(result).toEqual({ cycle: null, objectives: [] });
  });
});

describe('getScorecard — assembles Objectives with Key Results and Check-in history', () => {
  it('nests Key Results under each Objective, and check-in history under each Key Result', async () => {
    const client = mockClient();
    client.query
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
    client.query.mockResolvedValueOnce(CYCLE).mockResolvedValueOnce({ rows: [] });
    await getTeamProgress(client, 't1', MANAGER);
    const rowsCall = client.query.mock.calls[1];
    expect(rowsCall[1]).toEqual(['t1', 'cycle-1', 'mgr-1']);
    expect(rowsCall[0]).toMatch(/u\.manager_id = \$3/);
  });

  it('orders by risk: level_index ascending, then confidence ascending', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(CYCLE).mockResolvedValueOnce({ rows: [] });
    await getTeamProgress(client, 't1', MANAGER);
    expect(client.query.mock.calls[1][0]).toMatch(/ORDER BY "levelIndex" ASC, "latestConfidence" ASC NULLS FIRST/);
  });
});

describe('getAlignmentMap', () => {
  it('refuses a non-TenantAdmin', async () => {
    await expect(getAlignmentMap(mockClient(), 't1', EMPLOYEE)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getAlignmentMap(mockClient(), 't1', MANAGER)).rejects.toBeInstanceOf(ForbiddenError);
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
    });
    const result = await getCheckinCompliance(client, 't1', TENANT_ADMIN);
    expect(result.byOwner).toHaveLength(2);
    expect(result.byOwner[0].keyResults).toHaveLength(2);
    expect(result.byOwner[1].keyResults).toHaveLength(1);
  });

  it('returns an empty list with no active Cycle', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(NO_CYCLE);
    const result = await getCheckinCompliance(client, 't1', TENANT_ADMIN);
    expect(result).toEqual({ cycle: null, byOwner: [] });
  });
});
