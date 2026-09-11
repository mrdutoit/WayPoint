import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../frontend/api-lib/middleware/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  requireRole: (user, ...roles) => !!user && roles.includes(user.role),
}));
vi.mock('../frontend/api-lib/context/tenant.js', () => ({
  withTenantContext: (tenantId, fn) => fn({ query: vi.fn() }),
}));
vi.mock('../frontend/api-lib/services/auditService.js', () => ({ recordAuditEvent: vi.fn() }));
vi.mock('../frontend/api-lib/services/cycleService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getCyclesForTenant: vi.fn(), createCycle: vi.fn() };
});

const { getAuthenticatedUser } = await import('../frontend/api-lib/middleware/auth.js');
const cycleService = await import('../frontend/api-lib/services/cycleService.js');
const { ValidationError } = await import('../frontend/api-lib/services/errors.js');
const handler = (await import('../frontend/api/cycles-router.js')).default;

function mockReq({ method, slug = [], body }) {
  // Simulates the real Vercel rewrite shape (a slash-joined string, or
  // absent for the bare path) rather than a pre-split array — see
  // api-lib/http/helpers.js's parseSlug for why that distinction is the
  // whole point of this test harness shape.
  return { method, query: { slug: slug.length > 0 ? slug.join('/') : undefined }, body, headers: {} };
}
function mockRes() { const res = {}; res.status = vi.fn().mockReturnValue(res); res.json = vi.fn().mockReturnValue(res); return res; }

const EMPLOYEE = { id: 'u1', tenantId: 't1', role: 'Employee' };
const TENANT_ADMIN = { id: 'admin-1', tenantId: 't1', role: 'TenantAdmin' };

beforeEach(() => vi.clearAllMocks());

describe('cycles-router — GET /api/cycles', () => {
  it('is readable by any authenticated tenant role', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    cycleService.getCyclesForTenant.mockResolvedValue([{ id: 'cycle-1', status: 'Active' }]);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: [] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ cycles: [{ id: 'cycle-1', status: 'Active' }] });
  });
});

describe('cycles-router — POST /api/cycles (FR-014: TenantAdmin only)', () => {
  it('rejects an Employee', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: [], body: { name: 'Q1' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(cycleService.createCycle).not.toHaveBeenCalled();
  });

  it('maps an unrecognised service error to a logged 500, not a silent pass', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    cycleService.createCycle.mockRejectedValue(new Error('unexpected database failure'));
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: [], body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('maps a ValidationError (e.g. unknown cadenceId) to 400', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    cycleService.createCycle.mockRejectedValue(new ValidationError('cadenceId does not exist in this tenant'));
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: [], body: { name: 'Q1', cadenceId: 'bogus', startDate: '2026-01-01' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('maps OverlappingCycleError to 409', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    cycleService.createCycle.mockRejectedValue(new cycleService.OverlappingCycleError());
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: [], body: { name: 'Q1', cadenceId: 'cad-1', startDate: '2026-01-01' } }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('accepts a TenantAdmin request with no endDate (server-computed) and returns 201', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    cycleService.createCycle.mockResolvedValue({ id: 'cycle-1', name: 'Q1 2026', endDate: '2026-03-31' });
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: [], body: { name: 'Q1 2026', cadenceId: 'cad-quarterly', startDate: '2026-01-01' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    // the router only ever forwards { name, cadenceId, startDate } — no endDate/cadence text
    const callArgs = cycleService.createCycle.mock.calls[0];
    expect(callArgs[2]).toEqual({ name: 'Q1 2026', cadenceId: 'cad-quarterly', startDate: '2026-01-01' });
  });
});

describe('cycles-router — activation is retired', () => {
  it('returns 404 for the old POST /api/cycles/:id/activate path — no such route any more', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: ['cycle-1', 'activate'] }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
