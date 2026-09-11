import { describe, it, expect, vi } from 'vitest';
import { getElementConfigForTenant, setElementEnabled, isElementEnabled, ALL_ELEMENTS } from '../frontend/api-lib/services/okrElementConfigService.js';
import { ValidationError } from '../frontend/api-lib/services/errors.js';

function mockClient() {
  return { query: vi.fn() };
}

describe('getElementConfigForTenant', () => {
  it('defaults any element not yet seeded to true', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ elementKey: 'KeyResult', isEnabled: false }] });
    const config = await getElementConfigForTenant(client, 't1');
    expect(config.KeyResult).toBe(false);
    expect(config.Objective).toBe(true);
    expect(config.Initiative).toBe(true);
  });
});

describe('setElementEnabled — Objective can never be disabled', () => {
  it('rejects disabling Objective', async () => {
    await expect(setElementEnabled(mockClient(), 't1', 'Objective', false)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('setElementEnabled — rejects an unknown element', () => {
  it('throws ValidationError', async () => {
    await expect(setElementEnabled(mockClient(), 't1', 'Bogus', true)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('setElementEnabled — disabling is rejected while an enabled dependent exists (FR-025)', () => {
  it('rejects disabling KeyResult while Initiative is still enabled', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({
      rows: ALL_ELEMENTS.map((k) => ({ elementKey: k, isEnabled: true })),
    });
    await expect(setElementEnabled(client, 't1', 'KeyResult', false))
      .rejects.toThrow(/Initiative and CheckIn/);
  });

  it('rejects disabling KeyResult while only CheckIn is still enabled', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({
      rows: [
        { elementKey: 'Objective', isEnabled: true },
        { elementKey: 'KeyResult', isEnabled: true },
        { elementKey: 'Initiative', isEnabled: false },
        { elementKey: 'CheckIn', isEnabled: true },
        { elementKey: 'Reflection', isEnabled: true },
      ],
    });
    await expect(setElementEnabled(client, 't1', 'KeyResult', false)).rejects.toThrow(/CheckIn/);
  });

  it('allows disabling KeyResult once Initiative and CheckIn are already disabled', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({
        rows: [
          { elementKey: 'Objective', isEnabled: true },
          { elementKey: 'KeyResult', isEnabled: true },
          { elementKey: 'Initiative', isEnabled: false },
          { elementKey: 'CheckIn', isEnabled: false },
          { elementKey: 'Reflection', isEnabled: true },
        ],
      })
      .mockResolvedValueOnce({}) // upsert KeyResult -> false
      .mockResolvedValueOnce({ rows: [] }); // final re-read

    await expect(setElementEnabled(client, 't1', 'KeyResult', false)).resolves.toBeDefined();
  });

  it('allows disabling Reflection (no dependents) freely', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: ALL_ELEMENTS.map((k) => ({ elementKey: k, isEnabled: true })) })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] });

    await expect(setElementEnabled(client, 't1', 'Reflection', false)).resolves.toBeDefined();
  });
});

describe('setElementEnabled — enabling auto-enables the prerequisite chain', () => {
  it('enabling Initiative with Objective and KeyResult both currently off enables all three', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({
        rows: [
          { elementKey: 'Objective', isEnabled: true }, // Objective is always true in practice, but exercised as data here
          { elementKey: 'KeyResult', isEnabled: false },
          { elementKey: 'Initiative', isEnabled: false },
          { elementKey: 'CheckIn', isEnabled: false },
          { elementKey: 'Reflection', isEnabled: false },
        ],
      })
      .mockResolvedValueOnce({}) // upsert KeyResult -> true
      .mockResolvedValueOnce({}) // upsert Initiative -> true
      .mockResolvedValueOnce({ rows: [] }); // final re-read

    await setElementEnabled(client, 't1', 'Initiative', true);

    const upsertCalls = client.query.mock.calls.slice(1, 3);
    expect(upsertCalls[0][1]).toEqual(['t1', 'KeyResult', true]);
    expect(upsertCalls[1][1]).toEqual(['t1', 'Initiative', true]);
  });
});

describe('isElementEnabled', () => {
  it('returns true by default when nothing is seeded', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    expect(await isElementEnabled(client, 't1', 'KeyResult')).toBe(true);
  });

  it('returns false when explicitly disabled', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ elementKey: 'KeyResult', isEnabled: false }] });
    expect(await isElementEnabled(client, 't1', 'KeyResult')).toBe(false);
  });
});
