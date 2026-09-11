import { describe, it, expect, vi } from 'vitest';
import { listUsersForTenant, inviteUser, updateUserRole, forcePasswordResetForUser } from '../frontend/api-lib/services/userService.js';
import { ValidationError, ForbiddenError, NotFoundError } from '../frontend/api-lib/services/errors.js';

function mockClient() {
  return { query: vi.fn() };
}

const STRONG_PASSWORD = 'Correct-Horse-9!';

describe('inviteUser — validation', () => {
  it('rejects a role other than Manager/Employee', async () => {
    await expect(inviteUser(mockClient(), 't1', { role: 'TenantAdmin', email: 'a@b.com', firstName: 'A', lastName: 'B', password: STRONG_PASSWORD }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a weak password', async () => {
    await expect(inviteUser(mockClient(), 't1', { role: 'Employee', email: 'a@b.com', firstName: 'A', lastName: 'B', password: 'weak' }))
      .rejects.toThrow(/12 characters/);
  });

  it('rejects a managerId that does not exist in the tenant', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] }); // manager lookup — not found
    await expect(inviteUser(client, 't1', { role: 'Employee', email: 'a@b.com', firstName: 'A', lastName: 'B', password: STRONG_PASSWORD, managerId: 'missing' }))
      .rejects.toBeInstanceOf(ValidationError);
  });
});

describe('inviteUser — happy path', () => {
  it('creates the user with password_must_change true', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'user-1', role: 'Employee', email: 'a@b.com' }] }); // insert (no managerId, so no lookup query first)

    const created = await inviteUser(client, 't1', { role: 'Employee', email: 'A@B.com', firstName: 'A', lastName: 'B', password: STRONG_PASSWORD });

    expect(created.id).toBe('user-1');
    const insertCall = client.query.mock.calls[0];
    expect(insertCall[0]).toMatch(/password_must_change/);
    expect(insertCall[1][3]).toBe('a@b.com'); // email lower-cased
  });

  it('links a valid managerId', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'mgr-1' }] }) // manager lookup — found
      .mockResolvedValueOnce({ rows: [{ id: 'user-1' }] }); // insert

    await inviteUser(client, 't1', { role: 'Employee', email: 'a@b.com', firstName: 'A', lastName: 'B', password: STRONG_PASSWORD, managerId: 'mgr-1' });
    const insertCall = client.query.mock.calls[1];
    expect(insertCall[1][1]).toBe('mgr-1');
  });
});

describe('updateUserRole', () => {
  it('throws NotFoundError for a missing user', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(updateUserRole(client, 't1', 'missing', 'Manager')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses to change a TenantAdmin\'s role', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'admin-1', role: 'TenantAdmin' }] });
    await expect(updateUserRole(client, 't1', 'admin-1', 'Employee')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects an invalid target role', async () => {
    await expect(updateUserRole(mockClient(), 't1', 'user-1', 'PlatformAdmin')).rejects.toBeInstanceOf(ValidationError);
  });

  it('updates a valid Manager/Employee role change', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', role: 'Employee' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', role: 'Manager' }] });
    const updated = await updateUserRole(client, 't1', 'user-1', 'Manager');
    expect(updated.role).toBe('Manager');
  });
});

describe('forcePasswordResetForUser', () => {
  it('throws NotFoundError for a missing user', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(forcePasswordResetForUser(client, 't1', 'missing', STRONG_PASSWORD)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses to reset a TenantAdmin\'s password', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'admin-1', role: 'TenantAdmin' }] });
    await expect(forcePasswordResetForUser(client, 't1', 'admin-1', STRONG_PASSWORD)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a weak replacement password', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'user-1', role: 'Employee' }] });
    await expect(forcePasswordResetForUser(client, 't1', 'user-1', 'weak')).rejects.toThrow(/12 characters/);
  });

  it('sets password_must_change true and clears any lockout', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', role: 'Employee' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', email: 'a@b.com' }] });

    await forcePasswordResetForUser(client, 't1', 'user-1', STRONG_PASSWORD);
    const updateCall = client.query.mock.calls[1];
    expect(updateCall[0]).toMatch(/password_must_change = true/);
    expect(updateCall[0]).toMatch(/locked_until = NULL/);
  });
});

describe('listUsersForTenant', () => {
  it('returns users for the tenant', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'user-1' }] });
    expect(await listUsersForTenant(client, 't1')).toEqual([{ id: 'user-1' }]);
  });
});
