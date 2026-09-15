import { describe, it, expect, vi } from 'vitest';
import { createReflection, listReflectionsForObjective } from '../frontend/api-lib/services/reflectionService.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../frontend/api-lib/services/errors.js';

function mockClient() {
  return { query: vi.fn() };
}

const OWNER = { id: 'owner-1' };
const MANAGER = { id: 'manager-1' };
const STRANGER = { id: 'stranger-1' };
const TENANT_ADMIN = { id: 'admin-1', role: 'TenantAdmin' };
const OBJECTIVE_ROW = { id: 'obj-1', ownerId: 'owner-1', ownerManagerId: 'manager-1' };

const ELEMENT_ENABLED = { rows: [] };
const ELEMENT_DISABLED = { rows: [{ elementKey: 'Reflection', isEnabled: false }] };

describe('createReflection — FR-025 gate', () => {
  it('refuses when Reflection is disabled for the tenant', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(ELEMENT_DISABLED);
    await expect(createReflection(client, 't1', OWNER, 'obj-1', { content: 'We learned a lot' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('createReflection — ownership and validation', () => {
  it('throws NotFoundError for a missing Objective', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(ELEMENT_ENABLED).mockResolvedValueOnce({ rows: [] });
    await expect(createReflection(client, 't1', OWNER, 'missing', { content: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses a stranger', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(ELEMENT_ENABLED).mockResolvedValueOnce({ rows: [OBJECTIVE_ROW] });
    await expect(createReflection(client, 't1', STRANGER, 'obj-1', { content: 'x' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('requires content', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce(ELEMENT_ENABLED).mockResolvedValueOnce({ rows: [OBJECTIVE_ROW] });
    await expect(createReflection(client, 't1', OWNER, 'obj-1', { content: '   ' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('creates a Reflection authored by the caller', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce(ELEMENT_ENABLED)
      .mockResolvedValueOnce({ rows: [OBJECTIVE_ROW] })
      .mockResolvedValueOnce({ rows: [{ id: 'refl-1', authorId: 'owner-1', content: 'We learned a lot' }] });
    const created = await createReflection(client, 't1', OWNER, 'obj-1', { content: 'We learned a lot' });
    expect(created.authorId).toBe('owner-1');
    const insertCall = client.query.mock.calls[2];
    expect(insertCall[1]).toEqual(['t1', 'obj-1', 'owner-1', 'We learned a lot']);
  });
});

describe('listReflectionsForObjective — restricted to owner, Manager, TenantAdmin (deliberately NOT broadened with Objective visibility)', () => {
  it('throws NotFoundError for a missing Objective', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(listReflectionsForObjective(client, 't1', OWNER, 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses a stranger — this is exactly the check that did not exist before this round', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [OBJECTIVE_ROW] });
    await expect(listReflectionsForObjective(client, 't1', STRANGER, 'obj-1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows the owner', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [OBJECTIVE_ROW] })
      .mockResolvedValueOnce({ rows: [{ id: 'refl-2' }, { id: 'refl-1' }] });
    const result = await listReflectionsForObjective(client, 't1', OWNER, 'obj-1');
    expect(result).toEqual([{ id: 'refl-2' }, { id: 'refl-1' }]);
  });

  it('allows the owner\'s Manager', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [OBJECTIVE_ROW] }).mockResolvedValueOnce({ rows: [] });
    await expect(listReflectionsForObjective(client, 't1', MANAGER, 'obj-1')).resolves.toEqual([]);
  });

  it('allows TenantAdmin, who is neither the owner nor their Manager', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [OBJECTIVE_ROW] }).mockResolvedValueOnce({ rows: [] });
    await expect(listReflectionsForObjective(client, 't1', TENANT_ADMIN, 'obj-1')).resolves.toEqual([]);
  });

  it('orders by most recent first', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [OBJECTIVE_ROW] })
      .mockResolvedValueOnce({ rows: [{ id: 'refl-2' }, { id: 'refl-1' }] });
    await listReflectionsForObjective(client, 't1', OWNER, 'obj-1');
    expect(client.query.mock.calls[1][0]).toMatch(/ORDER BY r\.submitted_at DESC/);
  });
});
