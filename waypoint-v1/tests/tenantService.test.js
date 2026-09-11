import { describe, it, expect, vi } from 'vitest';
import { createTenantWithFirstAdmin, listTenants, getTenant } from '../frontend/api-lib/services/tenantService.js';
import { ValidationError, NotFoundError } from '../frontend/api-lib/services/errors.js';

function mockClient() {
  return { query: vi.fn() };
}

const VALID_ADMIN = { email: 'admin@acme.test', firstName: 'Ada', lastName: 'Lovelace', password: 'Correct-Horse-9!' };

describe('createTenantWithFirstAdmin — validation', () => {
  it('rejects a missing tenant name', async () => {
    await expect(createTenantWithFirstAdmin(mockClient(), { region: 'europe' }, VALID_ADMIN))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a missing admin email', async () => {
    await expect(createTenantWithFirstAdmin(mockClient(), { name: 'Acme' }, { ...VALID_ADMIN, email: '' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a weak admin password', async () => {
    await expect(createTenantWithFirstAdmin(mockClient(), { name: 'Acme' }, { ...VALID_ADMIN, password: 'short' }))
      .rejects.toThrow(/12 characters/);
  });
});

describe('createTenantWithFirstAdmin — happy path', () => {
  it('creates the tenant and its first TenantAdmin, forcing a password change', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1', name: 'Acme', region: 'europe', cascadeLevelCount: 4 }] }) // insert tenant
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', role: 'TenantAdmin', email: 'admin@acme.test', firstName: 'Ada', lastName: 'Lovelace' }] }); // insert user

    const result = await createTenantWithFirstAdmin(client, { name: 'Acme', region: 'europe' }, VALID_ADMIN);

    expect(result.tenant.id).toBe('tenant-1');
    expect(result.tenantAdmin.role).toBe('TenantAdmin');
    const userInsertCall = client.query.mock.calls[1];
    expect(userInsertCall[0]).toMatch(/password_must_change/);
    expect(userInsertCall[0]).toContain('true'); // password_must_change set true on creation
  });

  it('defaults region to europe when not supplied', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'user-1' }] });

    await createTenantWithFirstAdmin(client, { name: 'Acme' }, VALID_ADMIN);

    const tenantInsertCall = client.query.mock.calls[0];
    expect(tenantInsertCall[1]).toEqual(['Acme', 'europe']);
  });
});

describe('listTenants / getTenant', () => {
  it('lists tenants ordered by creation', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] });
    expect(await listTenants(client)).toEqual([{ id: 'tenant-1' }]);
  });

  it('throws NotFoundError for a missing tenant', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(getTenant(client, 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});
