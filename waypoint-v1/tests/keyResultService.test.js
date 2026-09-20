import { describe, it, expect, vi } from 'vitest';
import { createKeyResult, updateKeyResult, getKeyResultById, listKeyResultsForObjective } from '../frontend/api-lib/services/keyResultService.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../frontend/api-lib/services/objectiveService.js';

function mockClient() {
  return { query: vi.fn() };
}

describe('listKeyResultsForObjective', () => {
  it('scopes the query to the given tenant and objective', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    await listKeyResultsForObjective(client, 't1', 'obj-1');
    const [, params] = client.query.mock.calls[0];
    expect(params).toEqual(['t1', 'obj-1']);
  });

  it('includes lastCheckInAt per row, for showing check-in status on the Objective page without navigating away (2026-09-20)', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({
      rows: [
        { id: 'kr-1', title: 'A', lastCheckInAt: '2026-09-15T10:00:00.000Z' },
        { id: 'kr-2', title: 'B', lastCheckInAt: null },
      ],
    });
    const rows = await listKeyResultsForObjective(client, 't1', 'obj-1');
    expect(rows[0].lastCheckInAt).toBe('2026-09-15T10:00:00.000Z');
    expect(rows[1].lastCheckInAt).toBeNull();
    const [sql] = client.query.mock.calls[0];
    expect(sql).toMatch(/MAX\(ci\.submitted_at\)/);
  });
});

// Every createKeyResult test needs this as its FIRST mocked query now —
// isElementEnabled('KeyResult') is checked before anything else. Empty
// rows means "not yet seeded", which defaults to enabled.
const ELEMENT_ENABLED = { rows: [] };
const ELEMENT_DISABLED = { rows: [{ elementKey: 'KeyResult', isEnabled: false }] };

describe('createKeyResult — FR-025 gate', () => {
  it('rejects creation when KeyResult is disabled for the tenant', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(ELEMENT_DISABLED);
    await expect(createKeyResult(client, 't1', { id: 'u1' }, 'obj-1', { title: 'X' }))
      .rejects.toThrow(/disabled for this tenant/);
  });
});

describe('createKeyResult — authorisation and validation (FR-016)', () => {
  it('throws NotFoundError when the parent Objective does not exist', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(ELEMENT_ENABLED).mockResolvedValueOnce({ rows: [] });
    await expect(createKeyResult(client, 't1', { id: 'u1' }, 'obj-missing', { title: 'X' }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a caller who is neither the Objective owner nor their Manager', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(ELEMENT_ENABLED).mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: 'mgr-1' }] });
    await expect(createKeyResult(client, 't1', { id: 'stranger' }, 'obj-1', { title: 'X' }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a missing title', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(ELEMENT_ENABLED).mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: null }] });
    await expect(createKeyResult(client, 't1', { id: 'u1' }, 'obj-1', {}))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a non-positive weighting', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(ELEMENT_ENABLED).mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: null }] });
    await expect(createKeyResult(client, 't1', { id: 'u1' }, 'obj-1', { title: 'X', weighting: 0 }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects creating a Key Result when the tenant has no Scoring Rubric configured yet (FR-017)', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce(ELEMENT_ENABLED)
      .mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: null }] }) // objective lookup
      .mockResolvedValueOnce({ rows: [] }); // no rubric configured
    await expect(createKeyResult(client, 't1', { id: 'u1' }, 'obj-1', { title: 'X' }))
      .rejects.toThrow(/Scoring Rubric/);
  });

  it("resolves the tenant's rubric automatically when rubricId is not supplied, defaults weighting to 1, status to \"Not Started\"", async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce(ELEMENT_ENABLED)
      .mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: null }] }) // objective lookup
      .mockResolvedValueOnce({ rows: [{ id: 'rubric-1' }] }) // tenant's rubric
      .mockResolvedValueOnce({ rows: [{ id: 'kr-1', weighting: '1.00', status: 'Not Started' }] }); // insert

    const kr = await createKeyResult(client, 't1', { id: 'u1' }, 'obj-1', { title: 'Sign 10 new clients' });
    expect(kr.status).toBe('Not Started');
    const insertCall = client.query.mock.calls[3];
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

describe('getKeyResultById — visible tenant-wide, canEdit reflects the narrower owner+Manager rule', () => {
  const OWNER = { id: 'owner-1' };
  const MANAGER = { id: 'manager-1' };
  const STRANGER = { id: 'stranger-1' };
  const KR_ROW = {
    id: 'kr-1', tenantId: 't1', objectiveId: 'obj-1', rubricId: 'rubric-1',
    title: 'Sign 10 clients', weighting: '1', status: 'Not Started', createdAt: new Date(),
    ownerId: 'owner-1', ownerManagerId: 'manager-1',
  };

  it('throws NotFoundError when the Key Result does not exist', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(getKeyResultById(client, 't1', OWNER, 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('is visible to the owner, with canEdit true', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [KR_ROW] });
    const kr = await getKeyResultById(client, 't1', OWNER, 'kr-1');
    expect(kr.id).toBe('kr-1');
    expect(kr.canEdit).toBe(true);
    expect(kr.ownerId).toBeUndefined(); // internal-only field, stripped before returning
  });

  it('is visible to the owner\'s Manager, with canEdit true', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [KR_ROW] });
    const kr = await getKeyResultById(client, 't1', MANAGER, 'kr-1');
    expect(kr.id).toBe('kr-1');
    expect(kr.canEdit).toBe(true);
  });

  it('is now ALSO visible to a stranger, but with canEdit false', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [KR_ROW] });
    const kr = await getKeyResultById(client, 't1', STRANGER, 'kr-1');
    expect(kr.id).toBe('kr-1');
    expect(kr.canEdit).toBe(false);
  });
});
