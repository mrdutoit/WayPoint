import { describe, it, expect, vi } from 'vitest';
import { createCycle, OverlappingCycleError } from '../frontend/api-lib/services/cycleService.js';
import { ValidationError } from '../frontend/api-lib/services/errors.js';

function mockClient() {
  return { query: vi.fn() };
}

describe('createCycle — validation', () => {
  it('rejects a missing name', async () => {
    await expect(createCycle(mockClient(), 't1', { cadenceId: 'cad-1', startDate: '2026-01-01' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a missing cadenceId', async () => {
    await expect(createCycle(mockClient(), 't1', { name: 'Q1', startDate: '2026-01-01' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a missing startDate', async () => {
    await expect(createCycle(mockClient(), 't1', { name: 'Q1', cadenceId: 'cad-1' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a cadenceId that does not exist in the tenant', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] }); // cadence lookup — not found
    await expect(createCycle(client, 't1', { name: 'Q1', cadenceId: 'missing', startDate: '2026-01-01' }))
      .rejects.toBeInstanceOf(ValidationError);
  });
});

describe('createCycle — end_date is always server-computed, never accepted from the caller', () => {
  it("computes end_date from startDate + the Cadence's months (Quarterly = 3)", async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ months: 3 }] }) // cadence lookup
      .mockResolvedValueOnce({ rows: [{ id: 'cycle-1', name: 'Q3 2026', startDate: '2026-07-01', endDate: '2026-09-30' }] }); // insert

    const cycle = await createCycle(client, 't1', { name: 'Q3 2026', cadenceId: 'cad-quarterly', startDate: '2026-07-01' });

    expect(cycle.endDate).toBe('2026-09-30');
    const insertCall = client.query.mock.calls[1];
    expect(insertCall[1]).toEqual(['t1', 'Q3 2026', 'cad-quarterly', '2026-07-01', '2026-09-30']);
  });

  it('ignores an endDate passed in the input even if present', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ months: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'cycle-1' }] });

    await createCycle(client, 't1', { name: 'Jan', cadenceId: 'cad-monthly', startDate: '2026-01-01', endDate: '2099-01-01' });
    const insertCall = client.query.mock.calls[1];
    expect(insertCall[1][4]).toBe('2026-01-31'); // computed, not the bogus 2099 value
  });
});

describe('createCycle — overlap handling', () => {
  it('maps a Postgres exclusion-constraint violation (23P01) to OverlappingCycleError', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ months: 3 }] }) // cadence lookup succeeds
      .mockRejectedValueOnce(Object.assign(new Error('conflicting key value'), { code: '23P01' })); // insert violates EXCLUDE constraint

    await expect(createCycle(client, 't1', { name: 'Overlaps', cadenceId: 'cad-1', startDate: '2026-07-15' }))
      .rejects.toBeInstanceOf(OverlappingCycleError);
  });

  it('rethrows an unrelated database error unchanged', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ months: 3 }] })
      .mockRejectedValueOnce(new Error('connection reset'));

    await expect(createCycle(client, 't1', { name: 'X', cadenceId: 'cad-1', startDate: '2026-07-15' }))
      .rejects.toThrow('connection reset');
  });
});
