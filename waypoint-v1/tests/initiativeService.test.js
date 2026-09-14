import { describe, it, expect, vi } from 'vitest';
import { createInitiative, updateInitiative, listInitiativesForKeyResult } from '../frontend/api-lib/services/initiativeService.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../frontend/api-lib/services/errors.js';

function mockClient() {
  return { query: vi.fn() };
}

const OWNER = { id: 'owner-1' };
const MANAGER = { id: 'manager-1' };
const STRANGER = { id: 'stranger-1' };
const KEY_RESULT_ROW = { id: 'kr-1', objectiveId: 'obj-1', rubricId: 'rubric-1', ownerId: 'owner-1', ownerManagerId: 'manager-1' };

const ELEMENT_ENABLED = { rows: [] };
const ELEMENT_DISABLED = { rows: [{ elementKey: 'Initiative', isEnabled: false }] };

describe('createInitiative — FR-025 gate', () => {
  it('refuses when Initiative is disabled for the tenant', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(ELEMENT_DISABLED);
    await expect(createInitiative(client, 't1', OWNER, 'kr-1', { title: 'Do the thing' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('createInitiative — ownership and validation', () => {
  it('throws NotFoundError for a missing Key Result', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(ELEMENT_ENABLED).mockResolvedValueOnce({ rows: [] });
    await expect(createInitiative(client, 't1', OWNER, 'missing', { title: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses a stranger', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(ELEMENT_ENABLED).mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] });
    await expect(createInitiative(client, 't1', STRANGER, 'kr-1', { title: 'x' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('requires a title', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(ELEMENT_ENABLED).mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] });
    await expect(createInitiative(client, 't1', OWNER, 'kr-1', { title: '  ' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a malformed dueDate', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(ELEMENT_ENABLED).mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] });
    await expect(createInitiative(client, 't1', OWNER, 'kr-1', { title: 'x', dueDate: '12/25/2026' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('defaults ownerId to the caller when not given', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce(ELEMENT_ENABLED)
      .mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] })
      .mockResolvedValueOnce({ rows: [{ id: 'init-1', ownerId: 'owner-1' }] });
    const created = await createInitiative(client, 't1', OWNER, 'kr-1', { title: 'Ship the thing' });
    expect(created.ownerId).toBe('owner-1');
    const insertCall = client.query.mock.calls[2];
    expect(insertCall[1][2]).toBe('owner-1'); // owner_id param
  });

  it('validates an explicit ownerId exists in the tenant', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce(ELEMENT_ENABLED)
      .mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] })
      .mockResolvedValueOnce({ rows: [] }); // ownerId lookup — not found
    await expect(createInitiative(client, 't1', MANAGER, 'kr-1', { title: 'x', ownerId: 'nonexistent' }))
      .rejects.toBeInstanceOf(ValidationError);
  });
});

describe('updateInitiative', () => {
  const EXISTING = { id: 'init-1', keyResultId: 'kr-1', title: 'Old title', status: 'Not Started', dueDate: null };

  it('throws NotFoundError for a missing Initiative', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(updateInitiative(client, 't1', OWNER, 'missing', { status: 'Done' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects an invalid status', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [EXISTING] }).mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] });
    await expect(updateInitiative(client, 't1', OWNER, 'init-1', { status: 'Cancelled' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('accepts every valid status', async () => {
    for (const status of ['Not Started', 'In Progress', 'Done']) {
      const client = mockClient();
      client.query
        .mockResolvedValueOnce({ rows: [EXISTING] })
        .mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] })
        .mockResolvedValueOnce({ rows: [{ id: 'init-1', status }] });
      const updated = await updateInitiative(client, 't1', OWNER, 'init-1', { status });
      expect(updated.status).toBe(status);
    }
  });

  it('refuses a stranger', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [EXISTING] }).mockResolvedValueOnce({ rows: [KEY_RESULT_ROW] });
    await expect(updateInitiative(client, 't1', STRANGER, 'init-1', { status: 'Done' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('listInitiativesForKeyResult', () => {
  it('returns initiatives for the key result, oldest first', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'init-1' }] });
    const result = await listInitiativesForKeyResult(client, 't1', 'kr-1');
    expect(result).toEqual([{ id: 'init-1' }]);
    expect(client.query.mock.calls[0][0]).toMatch(/ORDER BY i\.created_at ASC/);
  });
});
