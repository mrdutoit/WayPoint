import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../frontend/api-lib/middleware/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  requireRole: (user, ...roles) => !!user && roles.includes(user.role),
}));
vi.mock('../frontend/api-lib/context/tenant.js', () => ({
  withTenantContext: (tenantId, fn) => fn({ query: vi.fn() }),
}));
vi.mock('../frontend/api-lib/services/auditService.js', () => ({ recordAuditEvent: vi.fn() }));
vi.mock('../frontend/api-lib/services/keyResultService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, updateKeyResult: vi.fn() };
});

const { getAuthenticatedUser } = await import('../frontend/api-lib/middleware/auth.js');
const keyResultService = await import('../frontend/api-lib/services/keyResultService.js');
const { ForbiddenError, NotFoundError } = await import('../frontend/api-lib/services/errors.js');
const handler = (await import('../frontend/api/key-results-router.js')).default;

function mockReq({ method, slug = [], body }) { return { method, query: { slug }, body, headers: {} }; }
function mockRes() { const res = {}; res.status = vi.fn().mockReturnValue(res); res.json = vi.fn().mockReturnValue(res); return res; }

const EMPLOYEE = { id: 'u1', tenantId: 't1', role: 'Employee' };

beforeEach(() => vi.clearAllMocks());

describe('key-results-router', () => {
  it('returns 401 without an authenticated user', async () => {
    getAuthenticatedUser.mockReturnValue(null);
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: ['kr-1'], body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 404 when no id is present in the path', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: [], body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('maps a ForbiddenError to 403', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    keyResultService.updateKeyResult.mockRejectedValue(new ForbiddenError());
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: ['kr-1'], body: { title: 'New' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('maps a NotFoundError to 404', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    keyResultService.updateKeyResult.mockRejectedValue(new NotFoundError());
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: ['kr-missing'], body: { title: 'New' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('accepts a valid request, never forwarding a status field to the service (FR-004)', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    keyResultService.updateKeyResult.mockResolvedValue({ id: 'kr-1', title: 'New', status: 'Not Started' });
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: ['kr-1'], body: { title: 'New', status: 'Achieved' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const callArgs = keyResultService.updateKeyResult.mock.calls[0];
    expect(callArgs[3]).toBe('kr-1');
    expect(callArgs[4]).toEqual({ title: 'New', weighting: undefined });
  });
});
