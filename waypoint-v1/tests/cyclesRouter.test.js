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
  return { ...actual, getCyclesForTenant: vi.fn(), createCycle: vi.fn(), activateCycle: vi.fn() };
});

const { getAuthenticatedUser } = await import('../frontend/api-lib/middleware/auth.js');
const cycleService = await import('../frontend/api-lib/services/cycleService.js');
const handler = (await import('../frontend/api/cycles-router.js')).default;

function mockReq({ method, slug = [], body }) { return { method, query: { slug }, body, headers: {} }; }
function mockRes() { const res = {}; res.status = vi.fn().mockReturnValue(res); res.json = vi.fn().mockReturnValue(res); return res; }

const EMPLOYEE = { id: 'u1', tenantId: 't1', role: 'Employee' };
const TENANT_ADMIN = { id: 'admin-1', tenantId: 't1', role: 'TenantAdmin' };

beforeEach(() => vi.clearAllMocks());

describe('cycles-router — GET /api/cycles', () => {
  it('is readable by any authenticated tenant role', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    cycleService.getCyclesForTenant.mockResolvedValue([{ id: 'cycle-1' }]);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: [] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ cycles: [{ id: 'cycle-1' }] });
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

  it('accepts a TenantAdmin and returns 201', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    cycleService.createCycle.mockResolvedValue({ id: 'cycle-1', is_active: false });
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: [], body: { name: 'Q1 2026', cadence: 'Quarterly', startDate: '2026-01-01', endDate: '2026-03-31' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('cycles-router — POST /api/cycles/:id/activate (FR-014: TenantAdmin only)', () => {
  it('rejects a Manager', async () => {
    getAuthenticatedUser.mockReturnValue({ id: 'mgr-1', tenantId: 't1', role: 'Manager' });
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: ['cycle-1', 'activate'] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('maps CycleNotFoundError to 404', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    cycleService.activateCycle.mockRejectedValue(new cycleService.CycleNotFoundError());
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: ['missing-cycle', 'activate'] }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('activates on a valid request', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    cycleService.activateCycle.mockResolvedValue({ id: 'cycle-1', is_active: true });
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: ['cycle-1', 'activate'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ cycle: { id: 'cycle-1', is_active: true } });
  });
});
