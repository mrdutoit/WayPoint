import { describe, it, expect, vi } from 'vitest';
import { getRubricForTenant, setRubricForTenant, DEFAULT_RUBRIC_LEVELS } from '../frontend/api-lib/services/scoringRubricService.js';
import { recomputeTenantStatuses } from '../frontend/api-lib/services/scoringService.js';

// The recompute is exercised for real in scoringService.test.js and the
// integration suite; here it's stubbed so these tests stay about the rubric.
vi.mock('../frontend/api-lib/services/scoringService.js', () => ({ recomputeTenantStatuses: vi.fn(async () => ({})) }));

function mockClient() {
  return { query: vi.fn() };
}

describe('getRubricForTenant', () => {
  it('returns null when the tenant has not configured a rubric yet', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    expect(await getRubricForTenant(client, 't1')).toBeNull();
  });

  it('returns the rubric with its ordered levels, including each level\'s id (needed for Check-in submission — Module 3)', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'rubric-1', name: 'Standard' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'level-1', levelIndex: 1, label: 'Off Track' }, { id: 'level-2', levelIndex: 2, label: 'On Track' }] });
    const rubric = await getRubricForTenant(client, 't1');
    expect(rubric).toEqual({
      id: 'rubric-1', name: 'Standard',
      levels: [{ id: 'level-1', levelIndex: 1, label: 'Off Track' }, { id: 'level-2', levelIndex: 2, label: 'On Track' }],
    });
  });
});

describe('setRubricForTenant — validation (FR-017: four or five levels)', () => {
  it('rejects fewer than four levels', async () => {
    await expect(setRubricForTenant(mockClient(), 't1', { name: 'Standard', levels: ['a', 'b', 'c'] }))
      .rejects.toThrow(/4 or 5/);
  });

  it('rejects more than five levels', async () => {
    await expect(setRubricForTenant(mockClient(), 't1', { name: 'Standard', levels: ['a', 'b', 'c', 'd', 'e', 'f'] }))
      .rejects.toThrow(/4 or 5/);
  });

  it('accepts DEFAULT_RUBRIC_LEVELS as a valid four-level rubric', async () => {
    expect(DEFAULT_RUBRIC_LEVELS).toHaveLength(4);
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // no existing rubric
      .mockResolvedValueOnce({ rows: [{ id: 'rubric-1' }] }) // insert rubric
      .mockResolvedValueOnce({}) // upsert level 1
      .mockResolvedValueOnce({}) // upsert level 2
      .mockResolvedValueOnce({}) // upsert level 3
      .mockResolvedValueOnce({}) // upsert level 4
      .mockResolvedValueOnce({}) // delete stray levels
      .mockResolvedValueOnce({ rows: [{ id: 'rubric-1', name: 'Standard' }] }) // final read: rubric
      .mockResolvedValueOnce({ rows: DEFAULT_RUBRIC_LEVELS.map((label, i) => ({ id: `level-${i + 1}`, levelIndex: i + 1, label })) }); // final read: levels

    const rubric = await setRubricForTenant(client, 't1', { name: 'Standard', levels: DEFAULT_RUBRIC_LEVELS });
    expect(rubric.levels.map((l) => l.label)).toEqual(DEFAULT_RUBRIC_LEVELS);
  });
});

describe('setRubricForTenant — get-or-create-one-per-tenant (FR-017)', () => {
  it('updates the existing rubric instead of creating a second one', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'existing-rubric' }] }) // existing rubric found
      .mockResolvedValueOnce({}) // UPDATE name
      .mockResolvedValueOnce({}) // upsert level 1
      .mockResolvedValueOnce({}) // upsert level 2
      .mockResolvedValueOnce({}) // upsert level 3
      .mockResolvedValueOnce({}) // upsert level 4
      .mockResolvedValueOnce({}) // delete stray levels
      .mockResolvedValueOnce({ rows: [{ id: 'existing-rubric', name: 'Renamed' }] })
      .mockResolvedValueOnce({ rows: [] });

    await setRubricForTenant(client, 't1', { name: 'Renamed', levels: DEFAULT_RUBRIC_LEVELS });

    const insertCall = client.query.mock.calls.find((c) => c[0].includes('INSERT INTO okr.scoring_rubric'));
    expect(insertCall).toBeUndefined(); // no new rubric row created
  });
});

describe('setRubricForTenant — keeps stored statuses in step (2026-09-25)', () => {
  it('recomputes every status in the tenant after saving, before returning the rubric', async () => {
    recomputeTenantStatuses.mockClear();
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'existing-rubric' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'existing-rubric', name: 'Renamed' }] })
      .mockResolvedValueOnce({ rows: [] });
    await setRubricForTenant(client, 't1', { name: 'Renamed', levels: ['Behind', 'Wobbly', 'Healthy', 'Done'] });
    expect(recomputeTenantStatuses).toHaveBeenCalledTimes(1);
    expect(recomputeTenantStatuses).toHaveBeenCalledWith(client, 't1');
  });
});
