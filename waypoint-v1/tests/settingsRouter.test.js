import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../frontend/api-lib/middleware/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  requireRole: (user, ...roles) => !!user && roles.includes(user.role),
}));
vi.mock('../frontend/api-lib/context/tenant.js', () => ({
  withTenantContext: (tenantId, fn) => fn({ query: vi.fn() }),
}));
vi.mock('../frontend/api-lib/services/auditService.js', () => ({ recordAuditEvent: vi.fn() }));
vi.mock('../frontend/api-lib/services/cascadeLevelService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getCascadeLevelsForTenant: vi.fn(), setCascadeLevelsForTenant: vi.fn() };
});
vi.mock('../frontend/api-lib/services/scoringRubricService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getRubricForTenant: vi.fn(), setRubricForTenant: vi.fn() };
});

const { getAuthenticatedUser } = await import('../frontend/api-lib/middleware/auth.js');
const cascadeLevelService = await import('../frontend/api-lib/services/cascadeLevelService.js');
const scoringRubricService = await import('../frontend/api-lib/services/scoringRubricService.js');
const { ValidationError } = await import('../frontend/api-lib/services/errors.js');
const handler = (await import('../frontend/api/settings-router.js')).default;

function mockReq({ method, slug = [], body }) { return { method, query: { slug }, body, headers: {} }; }
function mockRes() { const res = {}; res.status = vi.fn().mockReturnValue(res); res.json = vi.fn().mockReturnValue(res); return res; }

const EMPLOYEE = { id: 'u1', tenantId: 't1', role: 'Employee' };
const TENANT_ADMIN = { id: 'admin-1', tenantId: 't1', role: 'TenantAdmin' };

beforeEach(() => vi.clearAllMocks());

describe('settings-router — GET /api/settings/cascade-levels (FR-012)', () => {
  it('is readable by any authenticated tenant role', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    cascadeLevelService.getCascadeLevelsForTenant.mockResolvedValue([{ level_index: 1, label: 'Company' }]);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['cascade-levels'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('settings-router — PUT /api/settings/cascade-levels (FR-012: TenantAdmin only)', () => {
  it('rejects a non-TenantAdmin', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    const res = mockRes();
    await handler(mockReq({ method: 'PUT', slug: ['cascade-levels'], body: { labels: ['Company'] } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(cascadeLevelService.setCascadeLevelsForTenant).not.toHaveBeenCalled();
  });

  it('maps CascadeLevelInUseError to 409', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    cascadeLevelService.setCascadeLevelsForTenant.mockRejectedValue(new cascadeLevelService.CascadeLevelInUseError(2));
    const res = mockRes();
    await handler(mockReq({ method: 'PUT', slug: ['cascade-levels'], body: { labels: ['Company'] } }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('accepts a valid TenantAdmin request', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    cascadeLevelService.setCascadeLevelsForTenant.mockResolvedValue([{ level_index: 1, label: 'Company' }]);
    const res = mockRes();
    await handler(mockReq({ method: 'PUT', slug: ['cascade-levels'], body: { labels: ['Company'] } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('settings-router — GET /api/settings/rubric', () => {
  it('returns null with defaultLevels when nothing is configured yet', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    scoringRubricService.getRubricForTenant.mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['rubric'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.rubric).toBeNull();
    expect(payload.defaultLevels).toEqual(scoringRubricService.DEFAULT_RUBRIC_LEVELS);
  });
});

describe('settings-router — PUT /api/settings/rubric (FR-017: TenantAdmin only)', () => {
  it('rejects a Manager', async () => {
    getAuthenticatedUser.mockReturnValue({ id: 'mgr-1', tenantId: 't1', role: 'Manager' });
    const res = mockRes();
    await handler(mockReq({ method: 'PUT', slug: ['rubric'], body: { name: 'Standard', levels: [] } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('maps a ValidationError (wrong level count) to 400', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    scoringRubricService.setRubricForTenant.mockRejectedValue(
      new ValidationError('levels must be an array of 4 or 5 strings (FR-017)')
    );
    const res = mockRes();
    await handler(mockReq({ method: 'PUT', slug: ['rubric'], body: { name: 'Standard', levels: ['a', 'b'] } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('settings-router — unmatched routes', () => {
  it('returns 404 for an unknown settings resource', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['terminology'] }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
