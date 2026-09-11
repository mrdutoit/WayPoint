import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../frontend/api-lib/middleware/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  requireRole: (user, ...roles) => !!user && roles.includes(user.role),
}));
vi.mock('../frontend/api-lib/context/tenant.js', () => ({
  withTenantContext: (tenantId, fn) => fn({ query: vi.fn() }),
}));
vi.mock('../frontend/api-lib/services/auditService.js', () => ({ recordAuditEvent: vi.fn() }));
vi.mock('../frontend/api-lib/services/userService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listUsersForTenant: vi.fn(),
    inviteUser: vi.fn(),
    updateUserRole: vi.fn(),
    forcePasswordResetForUser: vi.fn(),
  };
});

const { getAuthenticatedUser } = await import('../frontend/api-lib/middleware/auth.js');
const userService = await import('../frontend/api-lib/services/userService.js');
const { ForbiddenError, ValidationError } = await import('../frontend/api-lib/services/errors.js');
const handler = (await import('../frontend/api/users-router.js')).default;

function mockReq({ method, slug = [], body }) { return { method, query: { slug }, body, headers: {} }; }
function mockRes() { const res = {}; res.status = vi.fn().mockReturnValue(res); res.json = vi.fn().mockReturnValue(res); return res; }

const TENANT_ADMIN = { id: 'ta-1', tenantId: 't1', role: 'TenantAdmin' };
const EMPLOYEE = { id: 'u1', tenantId: 't1', role: 'Employee' };
const PLATFORM_ADMIN = { id: 'admin-1', tenantId: null, role: 'PlatformAdmin' };

beforeEach(() => vi.clearAllMocks());

describe('users-router — authorisation', () => {
  it('returns 401 without an authenticated user', async () => {
    getAuthenticatedUser.mockReturnValue(null);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: [] }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 for a Platform Administrator (no tenant — this router is tenant-scoped)', async () => {
    getAuthenticatedUser.mockReturnValue(PLATFORM_ADMIN);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: [] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rejects a non-TenantAdmin (Employee)', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: [] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(userService.listUsersForTenant).not.toHaveBeenCalled();
  });
});

describe('users-router — GET /api/users', () => {
  it('returns the tenant\'s users for a TenantAdmin', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    userService.listUsersForTenant.mockResolvedValue([{ id: 'user-1' }]);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: [] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ users: [{ id: 'user-1' }] });
  });
});

describe('users-router — POST /api/users/invite', () => {
  it('creates the user and returns 201', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    userService.inviteUser.mockResolvedValue({ id: 'user-2', role: 'Employee' });
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: ['invite'], body: { role: 'Employee', email: 'a@b.com', firstName: 'A', lastName: 'B', password: 'Correct-Horse-9!' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('maps a duplicate-email Postgres error to 409', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    const err = new Error('duplicate key');
    err.code = '23505';
    userService.inviteUser.mockRejectedValue(err);
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: ['invite'], body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('maps a ValidationError to 400', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    userService.inviteUser.mockRejectedValue(new ValidationError('email is required'));
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: ['invite'], body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('users-router — PATCH /api/users/:id/role', () => {
  it('maps ForbiddenError (TenantAdmin role change) to 403', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    userService.updateUserRole.mockRejectedValue(new ForbiddenError());
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: ['user-1', 'role'], body: { role: 'Manager' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('updates the role on a valid request', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    userService.updateUserRole.mockResolvedValue({ id: 'user-1', role: 'Manager' });
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: ['user-1', 'role'], body: { role: 'Manager' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('users-router — PUT /api/users/:id/force-password-reset', () => {
  it('resets the password on a valid request', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    userService.forcePasswordResetForUser.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
    const res = mockRes();
    await handler(mockReq({ method: 'PUT', slug: ['user-1', 'force-password-reset'], body: { password: 'Correct-Horse-9!' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('maps a weak-password ValidationError to 400', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    userService.forcePasswordResetForUser.mockRejectedValue(new ValidationError('Must be at least 12 characters'));
    const res = mockRes();
    await handler(mockReq({ method: 'PUT', slug: ['user-1', 'force-password-reset'], body: { password: 'weak' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('users-router — unmatched routes', () => {
  it('returns 404 for an unrecognised path', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    const res = mockRes();
    await handler(mockReq({ method: 'DELETE', slug: ['user-1'] }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
