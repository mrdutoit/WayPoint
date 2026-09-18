import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../frontend/api-lib/middleware/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  requireRole: (user, ...roles) => !!user && roles.includes(user.role),
}));
vi.mock('../frontend/api-lib/context/tenant.js', () => ({
  withPlatformContext: vi.fn((fn) => fn({ query: vi.fn() })),
  withTenantContext: vi.fn((tenantId, fn) => fn({ query: vi.fn() })),
}));
vi.mock('../frontend/api-lib/services/auditService.js', () => ({
  recordAuditEvent: vi.fn(), listAuditEvents: vi.fn(), exportAuditEvents: vi.fn(),
}));
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
const { withTenantContext, withPlatformContext } = await import('../frontend/api-lib/context/tenant.js');
const tenantService = await import('../frontend/api-lib/services/tenantService.js');
const exportService = await import('../frontend/api-lib/services/exportService.js');
const { recordAuditEvent, listAuditEvents, exportAuditEvents } = await import('../frontend/api-lib/services/auditService.js');
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

describe('tenants-router — GET /api/audit-log (FR-031, resource=audit-log)', () => {
  const PLATFORM_ADMIN = { id: 'admin-1', tenantId: null, role: 'PlatformAdmin' };
  const TENANT_ADMIN = { id: 'ta-1', tenantId: 't1', role: 'TenantAdmin' };
  const MANAGER = { id: 'm-1', tenantId: 't1', role: 'Manager' };

  function auditReq(overrides) {
    return mockReq({ method: 'GET', query: { resource: 'audit-log' }, ...overrides });
  }

  it('rejects a Manager (and, by the same check, an Employee) outright', async () => {
    getAuthenticatedUser.mockReturnValue(MANAGER);
    const res = mockRes();
    await handler(auditReq({ slug: [] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(listAuditEvents).not.toHaveBeenCalled();
  });

  it("scopes a TenantAdmin's list to their own tenant via withTenantContext, ignoring any tenantId they pass", async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    listAuditEvents.mockResolvedValue([]);
    const res = mockRes();
    await handler(auditReq({ slug: [], query: { resource: 'audit-log', tenantId: 'some-other-tenant' } }), res);
    expect(withTenantContext).toHaveBeenCalledWith('t1', expect.any(Function));
    expect(withPlatformContext).not.toHaveBeenCalled();
  });

  it("scopes a PlatformAdmin's list to every tenant (withPlatformContext) when no tenantId filter is given", async () => {
    getAuthenticatedUser.mockReturnValue(PLATFORM_ADMIN);
    listAuditEvents.mockResolvedValue([]);
    const res = mockRes();
    await handler(auditReq({ slug: [] }), res);
    expect(withPlatformContext).toHaveBeenCalledWith(expect.any(Function));
    expect(withTenantContext).not.toHaveBeenCalled();
  });

  it("scopes a PlatformAdmin's list to one tenant when they do pass a tenantId filter", async () => {
    getAuthenticatedUser.mockReturnValue(PLATFORM_ADMIN);
    listAuditEvents.mockResolvedValue([]);
    const res = mockRes();
    await handler(auditReq({ slug: [], query: { resource: 'audit-log', tenantId: 't2' } }), res);
    expect(withTenantContext).toHaveBeenCalledWith('t2', expect.any(Function));
  });

  it('passes before/limit through to listAuditEvents', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    listAuditEvents.mockResolvedValue([]);
    await handler(auditReq({ slug: [], query: { resource: 'audit-log', before: '2026-09-01T00:00:00.000Z', limit: '20' } }), mockRes());
    expect(listAuditEvents).toHaveBeenCalledWith(expect.anything(), { before: '2026-09-01T00:00:00.000Z', limit: 20 });
  });

  it('returns nextBefore as the oldest row\'s timestamp when a full page comes back', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: `e${i}`, timestamp: `2026-09-${String(17 - i).padStart(2, '0')}` }));
    listAuditEvents.mockResolvedValue(rows);
    const res = mockRes();
    await handler(auditReq({ slug: [] }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ nextBefore: rows[49].timestamp }));
  });

  it('returns nextBefore null when the page is short (no more pages)', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    listAuditEvents.mockResolvedValue([{ id: 'e1', timestamp: '2026-09-17' }]);
    const res = mockRes();
    await handler(auditReq({ slug: [] }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ nextBefore: null }));
  });
});

describe('tenants-router — GET /api/audit-log/export (FR-031, resource=audit-log)', () => {
  const PLATFORM_ADMIN = { id: 'admin-1', tenantId: null, role: 'PlatformAdmin' };
  const TENANT_ADMIN = { id: 'ta-1', tenantId: 't1', role: 'TenantAdmin' };

  function auditExportReq(overrides) {
    return mockReq({ method: 'GET', slug: ['export'], query: { resource: 'audit-log' }, ...overrides });
  }

  it('rejects a role with neither TenantAdmin nor PlatformAdmin', async () => {
    getAuthenticatedUser.mockReturnValue({ id: 'e-1', tenantId: 't1', role: 'Employee' });
    const res = mockRes();
    await handler(auditExportReq({}), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(exportAuditEvents).not.toHaveBeenCalled();
  });

  it('passes startDate/endDate through to exportAuditEvents', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    exportAuditEvents.mockResolvedValue([]);
    await handler(auditExportReq({ query: { resource: 'audit-log', startDate: '2026-09-01', endDate: '2026-09-17' } }), mockRes());
    expect(exportAuditEvents).toHaveBeenCalledWith(expect.anything(), { startDate: '2026-09-01', endDate: '2026-09-17' });
  });

  it('records an export audit event scoped to the TenantAdmin\'s own tenant', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    exportAuditEvents.mockResolvedValue([]);
    await handler(auditExportReq({}), mockRes());
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 't1', actorId: 'ta-1', action: 'auditLog.exported' })
    );
  });

  it('records the export audit event with tenantId null for a true cross-tenant PlatformAdmin export (no single tenant to attribute it to)', async () => {
    getAuthenticatedUser.mockReturnValue(PLATFORM_ADMIN);
    exportAuditEvents.mockResolvedValue([]);
    await handler(auditExportReq({}), mockRes());
    expect(withPlatformContext).toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: null, actorId: 'admin-1' })
    );
  });

  it('sends CSV with the right content type for format=csv', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    exportAuditEvents.mockResolvedValue([{ id: 'e1', action: 'objective.updated', timestamp: '2026-09-17T00:00:00.000Z' }]);
    const res = mockRes();
    await handler(auditExportReq({ query: { resource: 'audit-log', format: 'csv' } }), res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('objective.updated'));
  });

  it('flattens the changes array into a readable string in CSV, not [object Object]', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    exportAuditEvents.mockResolvedValue([{
      id: 'e1', action: 'objective.updated', timestamp: '2026-09-17T00:00:00.000Z',
      changes: [{ field: 'title', from: 'Old title', to: 'New title' }],
    }]);
    const res = mockRes();
    await handler(auditExportReq({ query: { resource: 'audit-log', format: 'csv' } }), res);
    const csv = res.send.mock.calls[0][0];
    expect(csv).toContain('title: Old title → New title');
    expect(csv).not.toContain('[object Object]');
  });

  it('includes entityLabel in both JSON and CSV output', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    exportAuditEvents.mockResolvedValue([{ id: 'e1', action: 'objective.created', entityLabel: 'Grow net revenue by 20%', timestamp: '2026-09-17T00:00:00.000Z' }]);

    const jsonRes = mockRes();
    await handler(auditExportReq({ query: { resource: 'audit-log', format: 'json' } }), jsonRes);
    expect(JSON.parse(jsonRes.send.mock.calls[0][0]).events[0].entityLabel).toBe('Grow net revenue by 20%');

    const csvRes = mockRes();
    await handler(auditExportReq({ query: { resource: 'audit-log', format: 'csv' } }), csvRes);
    expect(csvRes.send.mock.calls[0][0]).toContain('Grow net revenue by 20%');
  });

  it('defaults to JSON for an unrecognised format', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    exportAuditEvents.mockResolvedValue([]);
    const res = mockRes();
    await handler(auditExportReq({ query: { resource: 'audit-log', format: 'xml' } }), res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
  });
});
