import { describe, it, expect, vi } from 'vitest';
import { createCycle, activateCycle, CycleNotFoundError } from '../frontend/api-lib/services/cycleService.js';

function mockClient() {
  return { query: vi.fn() };
}

describe('createCycle — validation', () => {
  it('rejects a missing name', async () => {
    await expect(createCycle(mockClient(), 't1', { cadence: 'Quarterly', startDate: '2026-01-01', endDate: '2026-03-31' }))
      .rejects.toThrow(/name/);
  });

  it('rejects a missing cadence', async () => {
    await expect(createCycle(mockClient(), 't1', { name: 'Q1', startDate: '2026-01-01', endDate: '2026-03-31' }))
      .rejects.toThrow(/cadence/);
  });

  it('rejects an end date on or before the start date', async () => {
    await expect(createCycle(mockClient(), 't1', { name: 'Q1', cadence: 'Quarterly', startDate: '2026-03-31', endDate: '2026-01-01' }))
      .rejects.toThrow(/endDate/);
  });

  it('creates a cycle with is_active false by default', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'cycle-1', is_active: false }] });
    const cycle = await createCycle(client, 't1', { name: 'Q1 2026', cadence: 'Quarterly', startDate: '2026-01-01', endDate: '2026-03-31' });
    expect(cycle.is_active).toBe(false);
    expect(client.query.mock.calls[0][0]).toContain('false');
  });
});

describe('activateCycle', () => {
  it('throws CycleNotFoundError when the cycle does not belong to the tenant', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] }); // target lookup — not found
    await expect(activateCycle(client, 't1', 'missing-cycle')).rejects.toBeInstanceOf(CycleNotFoundError);
  });

  it('deactivates the previously active cycle before activating the new one, as two separate statements', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'cycle-2' }] }) // target lookup — found
      .mockResolvedValueOnce({}) // deactivate previous
      .mockResolvedValueOnce({ rows: [{ id: 'cycle-2', is_active: true }] }); // activate target

    const cycle = await activateCycle(client, 't1', 'cycle-2');

    expect(cycle.is_active).toBe(true);
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[1][0]).toMatch(/is_active = false/);
    expect(client.query.mock.calls[2][0]).toMatch(/is_active = true/);
  });
});
