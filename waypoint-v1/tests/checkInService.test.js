import { describe, it, expect, vi } from 'vitest';
import { createCheckIn, listCheckInsForKeyResult } from '../frontend/api-lib/services/checkInService.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../frontend/api-lib/services/errors.js';

function mockClient() {
  return { query: vi.fn() };
}

const OWNER = { id: 'owner-1', role: 'Employee' };
const MANAGER = { id: 'manager-1', role: 'Manager' };
const STRANGER = { id: 'stranger-1', role: 'Employee' };

const KEY_RESULT_ROW = { id: 'kr-1', objectiveId: 'obj-1', rubricId: 'rubric-1', ownerId: 'owner-1', ownerManagerId: 'manager-1' };

const ELEMENT_ENABLED = { rows: [] };
const ELEMENT_DISABLED = { rows: [{ elementKey: 'CheckIn', isEnabled: false }] };

describe('createCheckIn — FR-025 gate', () => {
  it('refuses when Check-in is disabled for the tenant', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(ELEMENT_DISABLED);
    await expect(createCheckIn(client, 't1', OWNER, 'kr-1', { rubricLevelId: 'rl-1', confidence: 3 }))
      .rejects.toBeInstanceOf(ValidationError);
  });
});

describe('createCheckIn — ownership', () => {
  it('throws NotFoundError when the Key Result does not exist', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(ELEMENT_ENABLED).mockResolvedValueOnce({ rows: [] });
    await expect(createCheckIn(client, 't1', OWNER, 'missing', { rubricLevelId: 'rl-1', confidence: 3 }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses a caller who is neither the owner nor their Manager', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(ELEMENT_ENABLED).mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] });
    await expect(createCheckIn(client, 't1', STRANGER, 'kr-1', { rubricLevelId: 'rl-1', confidence: 3 }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows the owner\'s Manager, not just the owner', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce(ELEMENT_ENABLED)
      .mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] })
      .mockResolvedValueOnce({ rows: [{ id: 'rl-1' }] }) // rubric level belongs to tenant
      .mockResolvedValueOnce({ rows: [{ id: 'ci-1' }] }) // INSERT
      .mockResolvedValueOnce({ rows: [{ label: 'On Track' }] }) // recomputeKeyResultStatus's lookup
      .mockResolvedValueOnce({}) // recomputeKeyResultStatus's UPDATE
      .mockResolvedValueOnce({ rows: [] }) // recomputeObjectiveStatus's children lookup
      .mockResolvedValueOnce({ rows: [] }) // recomputeObjectiveStatus's rubric levels
      .mockResolvedValueOnce({ rows: [] }) // recomputeObjectiveStatus's own-Key-Result-scores lookup (no children -> this branch runs)
      .mockResolvedValueOnce({}) // recomputeObjectiveStatus's UPDATE
      .mockResolvedValueOnce({ rows: [{ parentId: null }] }); // no cascade

    const checkIn = await createCheckIn(client, 't1', MANAGER, 'kr-1', { rubricLevelId: 'rl-1', confidence: 4 });
    expect(checkIn.id).toBe('ci-1');
  });
});

describe('createCheckIn — validation', () => {
  async function setupPastOwnership(client) {
    client.query.mockResolvedValueOnce(ELEMENT_ENABLED).mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] });
  }

  it('requires rubricLevelId', async () => {
    const client = mockClient();
    await setupPastOwnership(client);
    await expect(createCheckIn(client, 't1', OWNER, 'kr-1', { confidence: 3 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a rubricLevelId that does not belong to this tenant\'s rubric', async () => {
    const client = mockClient();
    await setupPastOwnership(client);
    client.query.mockResolvedValueOnce({ rows: [] }); // rubric level lookup — not found
    await expect(createCheckIn(client, 't1', OWNER, 'kr-1', { rubricLevelId: 'wrong-tenant-level', confidence: 3 }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it.each([0, 6, 2.5, -1, NaN])('rejects an out-of-range or non-integer confidence: %s', async (badConfidence) => {
    const client = mockClient();
    await setupPastOwnership(client);
    client.query.mockResolvedValueOnce({ rows: [{ id: 'rl-1' }] });
    await expect(createCheckIn(client, 't1', OWNER, 'kr-1', { rubricLevelId: 'rl-1', confidence: badConfidence }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it.each([1, 2, 3, 4, 5])('accepts every valid confidence value: %i', async (goodConfidence) => {
    const client = mockClient();
    await setupPastOwnership(client);
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'rl-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ci-1' }] })
      .mockResolvedValueOnce({ rows: [{ label: 'On Track' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });

    const checkIn = await createCheckIn(client, 't1', OWNER, 'kr-1', { rubricLevelId: 'rl-1', confidence: goodConfidence });
    expect(checkIn.id).toBe('ci-1');
  });
});

describe('createCheckIn — triggers the FR-019 roll-up', () => {
  it('recomputes the Key Result and Objective status after inserting the Check-in', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce(ELEMENT_ENABLED)
      .mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] })
      .mockResolvedValueOnce({ rows: [{ id: 'rl-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ci-1' }] }) // INSERT check_in
      .mockResolvedValueOnce({ rows: [{ label: 'Achieved' }] }) // recomputeKeyResultStatus lookup
      .mockResolvedValueOnce({}) // recomputeKeyResultStatus UPDATE
      .mockResolvedValueOnce({ rows: [] }) // recomputeObjectiveStatus children
      .mockResolvedValueOnce({ rows: [{ level_index: 4, label: 'Achieved' }] }) // rubric levels
      .mockResolvedValueOnce({ rows: [{ weighting: '1', level_index: 4 }] }) // own-Key-Result-scores (this KR itself, now scored)
      .mockResolvedValueOnce({}) // recomputeObjectiveStatus UPDATE
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });

    await createCheckIn(client, 't1', OWNER, 'kr-1', { rubricLevelId: 'rl-1', confidence: 5, comment: 'Great progress' });

    // The INSERT into check_in must happen before either recompute call —
    // proves the roll-up reflects the Check-in that was just submitted.
    const sqlCalls = client.query.mock.calls.map((c) => c[0]);
    const insertIndex = sqlCalls.findIndex((sql) => sql.includes('INSERT INTO okr.check_in'));
    const krRecomputeIndex = sqlCalls.findIndex((sql) => sql.includes('FROM okr.check_in ci\n     JOIN okr.rubric_level'));
    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(krRecomputeIndex).toBeGreaterThan(insertIndex);
  });
});

describe('listCheckInsForKeyResult — restricted to owner, Manager, TenantAdmin (deliberately NOT broadened with Objective/Key Result visibility)', () => {
  const TENANT_ADMIN = { id: 'admin-1', role: 'TenantAdmin' };

  it('throws NotFoundError when the Key Result does not exist', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(listCheckInsForKeyResult(client, 't1', OWNER, 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses a stranger — this is exactly the check that did not exist before this round', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] });
    await expect(listCheckInsForKeyResult(client, 't1', STRANGER, 'kr-1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows the owner', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] })
      .mockResolvedValueOnce({ rows: [{ id: 'ci-2' }, { id: 'ci-1' }] });
    const result = await listCheckInsForKeyResult(client, 't1', OWNER, 'kr-1');
    expect(result).toEqual([{ id: 'ci-2' }, { id: 'ci-1' }]);
  });

  it('joins the submitter\'s name into each row (2026-09-23 — was previously stored but never surfaced anywhere)', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] })
      .mockResolvedValueOnce({
        rows: [{ id: 'ci-1', submittedById: 'mgr-1', submittedByFirstName: 'Fred', submittedByLastName: 'Steinberg' }],
      });
    const result = await listCheckInsForKeyResult(client, 't1', OWNER, 'kr-1');
    expect(result[0].submittedByFirstName).toBe('Fred');
    expect(result[0].submittedByLastName).toBe('Steinberg');
    const [sql] = client.query.mock.calls[1];
    expect(sql).toMatch(/JOIN okr\.user_account submitter/);
  });

  it('allows the owner\'s Manager', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(listCheckInsForKeyResult(client, 't1', MANAGER, 'kr-1')).resolves.toEqual([]);
  });

  it('allows TenantAdmin, who is neither the owner nor their Manager', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(listCheckInsForKeyResult(client, 't1', TENANT_ADMIN, 'kr-1')).resolves.toEqual([]);
  });

  it('orders by most recent first', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] })
      .mockResolvedValueOnce({ rows: [{ id: 'ci-2' }, { id: 'ci-1' }] });
    await listCheckInsForKeyResult(client, 't1', OWNER, 'kr-1');
    expect(client.query.mock.calls[1][0]).toMatch(/ORDER BY ci\.submitted_at DESC/);
  });
});
