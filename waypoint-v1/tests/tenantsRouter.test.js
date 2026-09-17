import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../frontend/api-lib/middleware/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  requireRole: (user, ...roles) => !!user && roles.includes(user.role),
}));
vi.mock('../frontend/api-lib/context/tenant.js', () => ({
  withPlatformContext: (fn) => fn({ query: vi.fn() }),
  withTenantContext: (tenantId, fn) => fn({ query: vi.fn() }),
}));
vi.mock('../frontend/api-lib/services/auditService.js', () => ({ recordAuditEvent: vi.fn() }));
vi.mock('../frontend/api-lib/services/tenantService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, listTenants: vi.fn(), getTenant: vi.fn(), createTenantWithFirstAdmin: vi.fn() };
});
vi.mock('../frontend/api-lib/services/exportService.js', () => ({
  exportTenantData: vi.fn(),
  formatExportAsJson: vi.fn(),
  formatExportAsCsvZip: vi.fn(),
}));

const { getAuthenticatedUser } = await import('../frontend/api-lib/middleware/auth.js');
const tenantService = await import('../frontend/api-lib/services/tenantService.js');
const exportService = await import('../frontend/api-lib/services/exportService.js');
const { recordAuditEvent } = await import('../frontend/api-lib/services/auditService.js');
const handler = (await import('../frontend/api/tenants-router.js')).default;

function mockReq({ method, slug = [], body, query = {} }) { return { method, query: { slug, ...query }, body, headers: {} }; }
function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

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

describe('tenants-router — GET /api/tenants/:id/export (FR-030)', () => {
  const PLATFORM_ADMIN = { id: 'admin-1', tenantId: null, role: 'PlatformAdmin' };
  const OWN_TENANT_ADMIN = { id: 'ta-1', tenantId: 't1', role: 'TenantAdmin' };
  const OTHER_TENANT_ADMIN = { id: 'ta-2', tenantId: 't2', role: 'TenantAdmin' };
  const EMPLOYEE = { id: 'e-1', tenantId: 't1', role: 'Employee' };

  it('allows a TenantAdmin to export their own tenant', async () => {
    getAuthenticatedUser.mockReturnValue(OWN_TENANT_ADMIN);
    exportService.exportTenantData.mockResolvedValue({ objectives: [] });
    exportService.formatExportAsJson.mockReturnValue('{"objectives":[]}');
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['t1', 'export'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('{"objectives":[]}');
  });

  it("rejects a TenantAdmin exporting a DIFFERENT tenant's data", async () => {
    getAuthenticatedUser.mockReturnValue(OTHER_TENANT_ADMIN);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['t1', 'export'] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(exportService.exportTenantData).not.toHaveBeenCalled();
  });

  it('rejects an Employee outright, even for their own tenant', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['t1', 'export'] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('allows a PlatformAdmin to export ANY tenant', async () => {
    getAuthenticatedUser.mockReturnValue(PLATFORM_ADMIN);
    exportService.exportTenantData.mockResolvedValue({ objectives: [] });
    exportService.formatExportAsJson.mockReturnValue('{"objectives":[]}');
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['t2', 'export'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('records an audit event for the export, scoped to the target tenant', async () => {
    getAuthenticatedUser.mockReturnValue(OWN_TENANT_ADMIN);
    exportService.exportTenantData.mockResolvedValue({ objectives: [] });
    exportService.formatExportAsJson.mockReturnValue('{}');
    await handler(mockReq({ method: 'GET', slug: ['t1', 'export'] }), mockRes());
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 't1', actorId: 'ta-1', action: 'tenant.exported' })
    );
  });

  it('defaults to JSON when format is missing or unrecognised', async () => {
    getAuthenticatedUser.mockReturnValue(OWN_TENANT_ADMIN);
    exportService.exportTenantData.mockResolvedValue({});
    exportService.formatExportAsJson.mockReturnValue('{}');
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['t1', 'export'], query: { format: 'xml' } }), res);
    expect(exportService.formatExportAsCsvZip).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
  });

  it('sends a zip with the correct content type when format=csv', async () => {
    getAuthenticatedUser.mockReturnValue(OWN_TENANT_ADMIN);
    exportService.exportTenantData.mockResolvedValue({});
    const fakeBuffer = Buffer.from('fake-zip-bytes');
    exportService.formatExportAsCsvZip.mockResolvedValue(fakeBuffer);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['t1', 'export'], query: { format: 'csv' } }), res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
    expect(res.send).toHaveBeenCalledWith(fakeBuffer);
    expect(exportService.formatExportAsJson).not.toHaveBeenCalled();
  });

  it('sets a Content-Disposition attachment header naming a .json or .zip file', async () => {
    getAuthenticatedUser.mockReturnValue(OWN_TENANT_ADMIN);
    exportService.exportTenantData.mockResolvedValue({});
    exportService.formatExportAsJson.mockReturnValue('{}');
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['t1', 'export'] }), res);
    const call = res.setHeader.mock.calls.find(([name]) => name === 'Content-Disposition');
    expect(call[1]).toMatch(/^attachment; filename="waypoint-export-\d{4}-\d{2}-\d{2}\.json"$/);
  });
});
