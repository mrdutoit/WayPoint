import { describe, it, expect, vi } from 'vitest';
import { getTerminologyForTenant, setTerminologyForTenant, DEFAULT_TERMS } from '../frontend/api-lib/services/terminologyService.js';
import { ValidationError } from '../frontend/api-lib/services/errors.js';

function mockClient() {
  return { query: vi.fn() };
}

describe('getTerminologyForTenant', () => {
  it('returns all defaults when nothing is overridden', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    expect(await getTerminologyForTenant(client, 't1')).toEqual(DEFAULT_TERMS);
  });

  it('merges an override over the defaults', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ termKey: 'Objective', customLabel: 'Goal' }] });
    const terms = await getTerminologyForTenant(client, 't1');
    expect(terms.Objective).toBe('Goal');
    expect(terms.KeyResult).toBe('Key Result'); // untouched default
  });
});

describe('setTerminologyForTenant — validation', () => {
  it('rejects an unknown term key', async () => {
    await expect(setTerminologyForTenant(mockClient(), 't1', { Bogus: 'X' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a non-object overrides argument', async () => {
    await expect(setTerminologyForTenant(mockClient(), 't1', null)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('setTerminologyForTenant — set and reset', () => {
  it('stores a real override', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({}) // upsert
      .mockResolvedValueOnce({ rows: [{ termKey: 'Objective', customLabel: 'Goal' }] }); // final re-read

    const terms = await setTerminologyForTenant(client, 't1', { Objective: 'Goal' });
    expect(terms.Objective).toBe('Goal');
    const upsertCall = client.query.mock.calls[0];
    expect(upsertCall[0]).toMatch(/INSERT INTO okr.terminology_setting/);
  });

  it('deletes the override (resets to default) when given a blank label', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({}) // delete
      .mockResolvedValueOnce({ rows: [] }); // final re-read

    await setTerminologyForTenant(client, 't1', { Objective: '   ' });
    const call = client.query.mock.calls[0];
    expect(call[0]).toMatch(/DELETE FROM okr.terminology_setting/);
  });

  it('deletes the override when the label is set back to the literal default', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [] });

    await setTerminologyForTenant(client, 't1', { KeyResult: 'Key Result' });
    const call = client.query.mock.calls[0];
    expect(call[0]).toMatch(/DELETE FROM okr.terminology_setting/);
  });

  it('trims whitespace on a real override', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [] });

    await setTerminologyForTenant(client, 't1', { Objective: '  Goal  ' });
    const call = client.query.mock.calls[0];
    expect(call[1]).toEqual(['t1', 'Objective', 'Goal']);
  });
});
