import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../frontend/api-lib/middleware/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
}));
vi.mock('../frontend/api-lib/context/tenant.js', () => ({
  withTenantContext: (tenantId, fn) => fn({ query: vi.fn() }),
}));
vi.mock('../frontend/api-lib/services/auditService.js', () => ({ recordAuditEvent: vi.fn() }));
vi.mock('../frontend/api-lib/services/initiativeService.js', () => ({ updateInitiative: vi.fn() }));

const { getAuthenticatedUser } = await import('../frontend/api-lib/middleware/auth.js');
const initiativeService = await import('../frontend/api-lib/services/initiativeService.js');
const { ForbiddenError, NotFoundError, ValidationError } = await import('../frontend/api-lib/services/errors.js');
const handler = (await import('../frontend/api/initiatives-router.js')).default;

function mockReq({ method, slug = [], body }) {
  return { method, query: { slug: slug.length > 0 ? slug.join('/') : undefined }, body, headers: {} };
}
function mockRes() { const res = {}; res.status = vi.fn().mockReturnValue(res); res.json = vi.fn().mockReturnValue(res); return res; }

const EMPLOYEE = { id: 'u1', tenantId: 't1', role: 'Employee' };
const PLATFORM_ADMIN = { id: 'admin-1', tenantId: null, role: 'PlatformAdmin' };

beforeEach(() => vi.clearAllMocks());

describe('initiatives-router — authentication and tenancy', () => {
  it('returns 401 without an authenticated user', async () => {
    getAuthenticatedUser.mockReturnValue(null);
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: ['init-1'], body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 for PlatformAdmin — Initiatives are tenant-scoped', async () => {
    getAuthenticatedUser.mockReturnValue(PLATFORM_ADMIN);
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: ['init-1'], body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('initiatives-router — PATCH /api/initiatives/:id', () => {
  it('returns 404 when no id is present', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: [], body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('accepts a valid update', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    initiativeService.updateInitiative.mockResolvedValue({ id: 'init-1', status: 'Done' });
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: ['init-1'], body: { status: 'Done' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('maps a ForbiddenError to 403', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    initiativeService.updateInitiative.mockRejectedValue(new ForbiddenError());
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: ['init-1'], body: { status: 'Done' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('maps a NotFoundError to 404', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    initiativeService.updateInitiative.mockRejectedValue(new NotFoundError());
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: ['init-missing'], body: { status: 'Done' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('maps an invalid-status ValidationError to 400', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    initiativeService.updateInitiative.mockRejectedValue(new ValidationError('status must be one of: ...'));
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: ['init-1'], body: { status: 'Cancelled' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('initiatives-router — unmatched routes', () => {
  it('returns 404 for an unsupported method', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    const res = mockRes();
    await handler(mockReq({ method: 'DELETE', slug: ['init-1'] }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
