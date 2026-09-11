import { describe, it, expect, vi } from 'vitest';
import { listCadencesForTenant, createCadence, updateCadence, deleteCadence, CadenceInUseError, DEFAULT_CADENCES } from '../frontend/api-lib/services/cadenceService.js';
import { ValidationError } from '../frontend/api-lib/services/errors.js';

function mockClient() {
  return { query: vi.fn() };
}

describe('DEFAULT_CADENCES', () => {
  it('has the four seeded defaults Mark specified', () => {
    expect(DEFAULT_CADENCES).toEqual([
      { label: 'Monthly', months: 1 },
      { label: 'Quarterly', months: 3 },
      { label: 'Bi-Annually', months: 6 },
      { label: 'Annually', months: 12 },
    ]);
  });
});

describe('createCadence — validation', () => {
  it('rejects a missing label', async () => {
    await expect(createCadence(mockClient(), 't1', { months: 3 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a non-positive months value', async () => {
    await expect(createCadence(mockClient(), 't1', { label: 'Weekly', months: 0 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a non-integer months value', async () => {
    await expect(createCadence(mockClient(), 't1', { label: 'Odd', months: 1.5 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('creates a valid cadence', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'cad-1', label: 'Weekly', months: 1 }] });
    const created = await createCadence(client, 't1', { label: 'Weekly', months: 1 });
    expect(created.label).toBe('Weekly');
  });
});

describe('updateCadence / deleteCadence — locked once used', () => {
  it('rejects updating a Cadence already referenced by a Cycle', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ 1: 1 }] }); // in-use check finds a Cycle
    await expect(updateCadence(client, 't1', 'cad-1', { label: 'Renamed', months: 3 }))
      .rejects.toBeInstanceOf(CadenceInUseError);
  });

  it('rejects deleting a Cadence already referenced by a Cycle', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    await expect(deleteCadence(client, 't1', 'cad-1')).rejects.toBeInstanceOf(CadenceInUseError);
  });

  it('allows updating a Cadence with no Cycles referencing it', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // not in use
      .mockResolvedValueOnce({ rows: [{ id: 'cad-1', label: 'Renamed', months: 4 }] }); // update
    const updated = await updateCadence(client, 't1', 'cad-1', { label: 'Renamed', months: 4 });
    expect(updated.label).toBe('Renamed');
  });

  it('allows deleting a Cadence with no Cycles referencing it', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // not in use
      .mockResolvedValueOnce({}); // delete
    await expect(deleteCadence(client, 't1', 'cad-1')).resolves.toBeUndefined();
  });
});

describe('listCadencesForTenant', () => {
  it('returns cadences ordered by months', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'cad-1', label: 'Monthly', months: 1 }] });
    expect(await listCadencesForTenant(client, 't1')).toEqual([{ id: 'cad-1', label: 'Monthly', months: 1 }]);
  });
});
