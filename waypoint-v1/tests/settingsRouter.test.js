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
vi.mock('../frontend/api-lib/services/cadenceService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, listCadencesForTenant: vi.fn(), createCadence: vi.fn(), updateCadence: vi.fn(), deleteCadence: vi.fn() };
});
vi.mock('../frontend/api-lib/services/okrElementConfigService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getElementConfigForTenant: vi.fn(), setElementEnabled: vi.fn() };
});
vi.mock('../frontend/api-lib/services/terminologyService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getTerminologyForTenant: vi.fn(), setTerminologyForTenant: vi.fn() };
});

const { getAuthenticatedUser } = await import('../frontend/api-lib/middleware/auth.js');
const cascadeLevelService = await import('../frontend/api-lib/services/cascadeLevelService.js');
const scoringRubricService = await import('../frontend/api-lib/services/scoringRubricService.js');
const cadenceService = await import('../frontend/api-lib/services/cadenceService.js');
const okrElementConfigService = await import('../frontend/api-lib/services/okrElementConfigService.js');
const terminologyService = await import('../frontend/api-lib/services/terminologyService.js');
const { ValidationError } = await import('../frontend/api-lib/services/errors.js');
const handler = (await import('../frontend/api/settings-router.js')).default;

function mockReq({ method, slug = [], body }) {
  // Simulates the real Vercel rewrite shape (a slash-joined string, or
  // absent for the bare path) rather than a pre-split array — see
  // api-lib/http/helpers.js's parseSlug for why that distinction is the
  // whole point of this test harness shape.
  return { method, query: { slug: slug.length > 0 ? slug.join('/') : undefined }, body, headers: {} };
}
function mockRes() { const res = {}; res.status = vi.fn().mockReturnValue(res); res.json = vi.fn().mockReturnValue(res); res.end = vi.fn().mockReturnValue(res); return res; }

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
    await handler(mockReq({ method: 'GET', slug: ['not-a-real-resource'] }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('settings-router — GET /api/settings/cadences', () => {
  it('is readable by any authenticated tenant role', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    cadenceService.listCadencesForTenant.mockResolvedValue([{ id: 'cad-1', label: 'Monthly', months: 1 }]);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['cadences'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('settings-router — POST /api/settings/cadences (TenantAdmin only)', () => {
  it('rejects a non-TenantAdmin', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: ['cadences'], body: { label: 'Weekly', months: 1 } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(cadenceService.createCadence).not.toHaveBeenCalled();
  });

  it('accepts a valid TenantAdmin request and returns 201', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    cadenceService.createCadence.mockResolvedValue({ id: 'cad-new', label: 'Weekly', months: 1 });
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: ['cadences'], body: { label: 'Weekly', months: 1 } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('settings-router — PATCH/DELETE /api/settings/cadences/:id', () => {
  it('maps CadenceInUseError to 409 on update', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    cadenceService.updateCadence.mockRejectedValue(new cadenceService.CadenceInUseError());
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: ['cadences', 'cad-1'], body: { label: 'Renamed', months: 3 } }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('maps CadenceInUseError to 409 on delete', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    cadenceService.deleteCadence.mockRejectedValue(new cadenceService.CadenceInUseError());
    const res = mockRes();
    await handler(mockReq({ method: 'DELETE', slug: ['cadences', 'cad-1'] }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('deletes successfully and returns 204', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    cadenceService.deleteCadence.mockResolvedValue(undefined);
    const res = mockRes();
    await handler(mockReq({ method: 'DELETE', slug: ['cadences', 'cad-1'] }), res);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('rejects a non-TenantAdmin trying to delete', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    const res = mockRes();
    await handler(mockReq({ method: 'DELETE', slug: ['cadences', 'cad-1'] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(cadenceService.deleteCadence).not.toHaveBeenCalled();
  });
});

describe('settings-router — GET /api/settings/okr-elements (FR-025)', () => {
  it('is readable by any authenticated tenant role', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    okrElementConfigService.getElementConfigForTenant.mockResolvedValue({ Objective: true, KeyResult: true });
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['okr-elements'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('settings-router — PATCH /api/settings/okr-elements/:key (TenantAdmin only)', () => {
  it('rejects a non-TenantAdmin', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: ['okr-elements', 'KeyResult'], body: { isEnabled: false } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(okrElementConfigService.setElementEnabled).not.toHaveBeenCalled();
  });

  it('maps a ValidationError (e.g. disabling Objective) to 400', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    okrElementConfigService.setElementEnabled.mockRejectedValue(new ValidationError('Objective is the base unit and can never be disabled (FR-025)'));
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: ['okr-elements', 'Objective'], body: { isEnabled: false } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('accepts a valid TenantAdmin request', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    okrElementConfigService.setElementEnabled.mockResolvedValue({ KeyResult: false });
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: ['okr-elements', 'KeyResult'], body: { isEnabled: false } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('settings-router — GET/PUT /api/settings/terminology (FR-013)', () => {
  it('GET is readable by any authenticated tenant role', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    terminologyService.getTerminologyForTenant.mockResolvedValue({ Objective: 'Objective' });
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['terminology'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('PUT rejects a non-TenantAdmin', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    const res = mockRes();
    await handler(mockReq({ method: 'PUT', slug: ['terminology'], body: { Objective: 'Goal' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(terminologyService.setTerminologyForTenant).not.toHaveBeenCalled();
  });

  it('PUT accepts a valid TenantAdmin request', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    terminologyService.setTerminologyForTenant.mockResolvedValue({ Objective: 'Goal' });
    const res = mockRes();
    await handler(mockReq({ method: 'PUT', slug: ['terminology'], body: { Objective: 'Goal' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
