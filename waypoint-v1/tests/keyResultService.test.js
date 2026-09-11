import { describe, it, expect, vi } from 'vitest';
import { createKeyResult, updateKeyResult, computeKeyResultStatus } from '../frontend/api-lib/services/keyResultService.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../frontend/api-lib/services/objectiveService.js';

function mockClient() {
  return { query: vi.fn() };
}

// ---------- FR-024: Key Result with no Check-ins ----------
describe('computeKeyResultStatus (FR-024)', () => {
  it('returns "Not Started" when there are no Check-ins', () => {
    expect(computeKeyResultStatus([])).toBe('Not Started');
  });

  it('does not silently fabricate a score-from-latest-Check-in before Check-ins exist (Module 3)', () => {
    expect(() => computeKeyResultStatus([{ id: 'c1' }])).toThrow(/Module 3/);
  });
});

describe('createKeyResult — authorisation and validation (FR-016)', () => {
  it('throws NotFoundError when the parent Objective does not exist', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(createKeyResult(client, 't1', { id: 'u1' }, 'obj-missing', { title: 'X' }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a caller who is neither the Objective owner nor their Manager', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: 'mgr-1' }] });
    await expect(createKeyResult(client, 't1', { id: 'stranger' }, 'obj-1', { title: 'X' }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a missing title', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: null }] });
    await expect(createKeyResult(client, 't1', { id: 'u1' }, 'obj-1', {}))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a non-positive weighting', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: null }] });
    await expect(createKeyResult(client, 't1', { id: 'u1' }, 'obj-1', { title: 'X', weighting: 0 }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects creating a Key Result when the tenant has no Scoring Rubric configured yet (FR-017)', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: null }] }) // objective lookup
      .mockResolvedValueOnce({ rows: [] }); // no rubric configured
    await expect(createKeyResult(client, 't1', { id: 'u1' }, 'obj-1', { title: 'X' }))
      .rejects.toThrow(/Scoring Rubric/);
  });

  it('resolves the tenant\'s rubric automatically when rubricId is not supplied, defaults weighting to 1, status to "Not Started"', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: null }] }) // objective lookup
      .mockResolvedValueOnce({ rows: [{ id: 'rubric-1' }] }) // tenant's rubric
      .mockResolvedValueOnce({ rows: [{ id: 'kr-1', weighting: '1.00', status: 'Not Started' }] }); // insert

    const kr = await createKeyResult(client, 't1', { id: 'u1' }, 'obj-1', { title: 'Sign 10 new clients' });
    expect(kr.status).toBe('Not Started');
    const insertCall = client.query.mock.calls[2];
    expect(insertCall[1]).toEqual(['t1', 'obj-1', 'rubric-1', 'Sign 10 new clients', 1]);
  });
});

describe('updateKeyResult — does not accept status (FR-004)', () => {
  it('rejects when the Key Result does not exist', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(updateKeyResult(client, 't1', { id: 'u1' }, 'kr-missing', { title: 'X' }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a caller who cannot edit the parent Objective', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'kr-1', objectiveId: 'obj-1', title: 'Old', weighting: '1.00' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: 'mgr-1' }] });
    await expect(updateKeyResult(client, 't1', { id: 'stranger' }, 'kr-1', { title: 'New' }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('updates title and weighting only — the query never references a status column', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'kr-1', objectiveId: 'obj-1', title: 'Old', weighting: '1.00' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'kr-1', title: 'New title', weighting: '2.50' }] });

    const kr = await updateKeyResult(client, 't1', { id: 'u1' }, 'kr-1', { title: 'New title', weighting: 2.5 });
    expect(kr.title).toBe('New title');
    const updateSql = client.query.mock.calls[2][0];
    expect(updateSql).not.toMatch(/status\s*=/);
  });
});
