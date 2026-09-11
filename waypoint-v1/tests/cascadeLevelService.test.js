import { describe, it, expect, vi } from 'vitest';
import {
  getCascadeLevelsForTenant, setCascadeLevelsForTenant, CascadeLevelInUseError,
} from '../frontend/api-lib/services/cascadeLevelService.js';

function mockClient() {
  return { query: vi.fn() };
}

describe('getCascadeLevelsForTenant', () => {
  it('returns levels ordered by level_index', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ level_index: 1, label: 'Company' }] });
    const rows = await getCascadeLevelsForTenant(client, 'tenant-1');
    expect(rows).toEqual([{ level_index: 1, label: 'Company' }]);
    expect(client.query.mock.calls[0][1]).toEqual(['tenant-1']);
  });
});

describe('setCascadeLevelsForTenant — validation', () => {
  it('rejects an empty labels array', async () => {
    await expect(setCascadeLevelsForTenant(mockClient(), 'tenant-1', [])).rejects.toThrow(/1 to 4/);
  });

  it('rejects more than four levels', async () => {
    await expect(setCascadeLevelsForTenant(mockClient(), 'tenant-1', ['a', 'b', 'c', 'd', 'e'])).rejects.toThrow(/1 to 4/);
  });

  it('rejects a blank label', async () => {
    await expect(setCascadeLevelsForTenant(mockClient(), 'tenant-1', ['Company', '  '])).rejects.toThrow(/non-empty/);
  });
});

describe('setCascadeLevelsForTenant — reconfiguration', () => {
  it('upserts each level by index and updates tenant.cascade_level_count', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // existing levels (none)
      .mockResolvedValueOnce({}) // upsert level 1
      .mockResolvedValueOnce({}) // upsert level 2
      .mockResolvedValueOnce({}) // tenant.cascade_level_count update
      .mockResolvedValueOnce({ rows: [{ level_index: 1, label: 'Company' }, { level_index: 2, label: 'Team' }] }); // final read

    const result = await setCascadeLevelsForTenant(client, 'tenant-1', ['Company', 'Team']);

    expect(result).toHaveLength(2);
    const countUpdateCall = client.query.mock.calls.find((c) => c[0].includes('cascade_level_count'));
    expect(countUpdateCall[1]).toEqual(['tenant-1', 2]);
  });

  it('rejects shrinking past a level still referenced by an Objective (FR-012)', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ level_index: 1 }, { level_index: 2 }, { level_index: 3 }] }) // existing: 3 levels
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] }); // level 3 still referenced by an Objective

    await expect(setCascadeLevelsForTenant(client, 'tenant-1', ['Company', 'Team']))
      .rejects.toBeInstanceOf(CascadeLevelInUseError);
  });

  it('allows shrinking a level that is not referenced by any Objective', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ level_index: 1 }, { level_index: 2 }, { level_index: 3 }] }) // existing: 3 levels
      .mockResolvedValueOnce({ rows: [] }) // level 3 not in use
      .mockResolvedValueOnce({}) // upsert level 1
      .mockResolvedValueOnce({}) // upsert level 2
      .mockResolvedValueOnce({}) // delete level 3
      .mockResolvedValueOnce({}) // tenant.cascade_level_count update
      .mockResolvedValueOnce({ rows: [{ level_index: 1, label: 'Company' }, { level_index: 2, label: 'Team' }] }); // final read

    const result = await setCascadeLevelsForTenant(client, 'tenant-1', ['Company', 'Team']);
    expect(result).toHaveLength(2);
  });
});
