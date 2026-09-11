import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../frontend/api-lib/middleware/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  requireRole: (user, ...roles) => !!user && roles.includes(user.role),
}));
vi.mock('../frontend/api-lib/context/tenant.js', () => ({
  withPlatformContext: (fn) => fn({ query: vi.fn() }),
}));
vi.mock('../frontend/api-lib/services/auditService.js', () => ({ recordAuditEvent: vi.fn() }));
vi.mock('../frontend/api-lib/services/tenantService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, listTenants: vi.fn(), getTenant: vi.fn(), createTenantWithFirstAdmin: vi.fn() };
});

const { getAuthenticatedUser } = await import('../frontend/api-lib/middleware/auth.js');
const tenantService = await import('../frontend/api-lib/services/tenantService.js');
const handler = (await import('../frontend/api/tenants-router.js')).default;

function mockReq({ method, slug = [], body }) { return { method, query: { slug }, body, headers: {} }; }
function mockRes() { const res = {}; res.status = vi.fn().mockReturnValue(res); res.json = vi.fn().mockReturnValue(res); return res; }

const PLATFORM_ADMIN = { id: 'admin-1', tenantId: null, role: 'PlatformAdmin' };
const TENANT_ADMIN = { id: 'ta-1', tenantId: 't1', role: 'TenantAdmin' };

beforeEach(() => vi.clearAllMocks());

describe('tenants-router — authorisation', () => {
  it('returns 401 without an authenticated user', async () => {
    getAuthenticatedUser.mockReturnValue(null);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: [] }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects a TenantAdmin — Platform Administrator only', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: [] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('tenants-router — POST /api/tenants (FR-011)', () => {
  it('creates a tenant with its first TenantAdmin and returns 201', async () => {
    getAuthenticatedUser.mockReturnValue(PLATFORM_ADMIN);
    tenantService.createTenantWithFirstAdmin.mockResolvedValue({
      tenant: { id: 'tenant-1', name: 'Acme' },
      tenantAdmin: { id: 'user-1', role: 'TenantAdmin' },
    });
    const res = mockRes();
    await handler(mockReq({
      method: 'POST', slug: [],
      body: { name: 'Acme', region: 'europe', adminEmail: 'a@acme.test', adminFirstName: 'Ada', adminLastName: 'Lovelace', adminPassword: 'Correct-Horse-9!' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ tenant: { id: 'tenant-1', name: 'Acme' }, tenantAdmin: { id: 'user-1', role: 'TenantAdmin' } });
  });

  it('maps a duplicate-email Postgres error to 409', async () => {
    getAuthenticatedUser.mockReturnValue(PLATFORM_ADMIN);
    const err = new Error('duplicate key value violates unique constraint');
    err.code = '23505';
    tenantService.createTenantWithFirstAdmin.mockRejectedValue(err);
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: [], body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('maps a ValidationError to 400', async () => {
    getAuthenticatedUser.mockReturnValue(PLATFORM_ADMIN);
    const { ValidationError } = await import('../frontend/api-lib/services/errors.js');
    tenantService.createTenantWithFirstAdmin.mockRejectedValue(new ValidationError('name is required'));
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: [], body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('tenants-router — GET /api/tenants/:id', () => {
  it('maps NotFoundError to 404', async () => {
    getAuthenticatedUser.mockReturnValue(PLATFORM_ADMIN);
    const { NotFoundError } = await import('../frontend/api-lib/services/errors.js');
    tenantService.getTenant.mockRejectedValue(new NotFoundError());
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['missing'] }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns the tenant on success', async () => {
    getAuthenticatedUser.mockReturnValue(PLATFORM_ADMIN);
    tenantService.getTenant.mockResolvedValue({ id: 'tenant-1', name: 'Acme' });
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['tenant-1'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
