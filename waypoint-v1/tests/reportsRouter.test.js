import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../frontend/api-lib/middleware/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
}));
vi.mock('../frontend/api-lib/context/tenant.js', () => ({
  withTenantContext: (tenantId, fn) => fn({ query: vi.fn() }),
}));
vi.mock('../frontend/api-lib/services/reportingService.js', () => ({
  getScorecard: vi.fn(), getTeamProgress: vi.fn(), getAlignmentMap: vi.fn(), getCheckinCompliance: vi.fn(),
}));

const { getAuthenticatedUser } = await import('../frontend/api-lib/middleware/auth.js');
const reportingService = await import('../frontend/api-lib/services/reportingService.js');
const { ForbiddenError } = await import('../frontend/api-lib/services/errors.js');
const handler = (await import('../frontend/api/reports-router.js')).default;

function mockReq({ method, slug = [], body }) {
  return { method, query: { slug: slug.length > 0 ? slug.join('/') : undefined }, body, headers: {} };
}
function mockRes() { const res = {}; res.status = vi.fn().mockReturnValue(res); res.json = vi.fn().mockReturnValue(res); return res; }

const MANAGER = { id: 'mgr-1', tenantId: 't1', role: 'Manager' };
const TENANT_ADMIN = { id: 'admin-1', tenantId: 't1', role: 'TenantAdmin' };
const PLATFORM_ADMIN = { id: 'padmin-1', tenantId: null, role: 'PlatformAdmin' };

beforeEach(() => vi.clearAllMocks());

describe('reports-router — authentication and tenancy', () => {
  it('returns 401 without an authenticated user', async () => {
    getAuthenticatedUser.mockReturnValue(null);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['team-progress'] }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 for PlatformAdmin — reports are tenant-scoped', async () => {
    getAuthenticatedUser.mockReturnValue(PLATFORM_ADMIN);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['team-progress'] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 404 for a non-GET method', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: ['team-progress'] }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('reports-router — GET /api/reports/scorecard/:userId', () => {
  it('returns the scorecard', async () => {
    getAuthenticatedUser.mockReturnValue(MANAGER);
    reportingService.getScorecard.mockResolvedValue({ cycle: null, objectives: [] });
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['scorecard', 'emp-1'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 404 with no userId', async () => {
    getAuthenticatedUser.mockReturnValue(MANAGER);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['scorecard'] }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('maps a ForbiddenError to 403', async () => {
    getAuthenticatedUser.mockReturnValue(MANAGER);
    reportingService.getScorecard.mockRejectedValue(new ForbiddenError());
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['scorecard', 'other-emp'] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('reports-router — GET /api/reports/team-progress', () => {
  it('returns team progress', async () => {
    getAuthenticatedUser.mockReturnValue(MANAGER);
    reportingService.getTeamProgress.mockResolvedValue({ cycle: null, rows: [] });
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['team-progress'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('reports-router — GET /api/reports/alignment-map', () => {
  it('returns the alignment map', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    reportingService.getAlignmentMap.mockResolvedValue({ cycle: null, objectives: [] });
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['alignment-map'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('reports-router — GET /api/reports/checkin-compliance', () => {
  it('returns check-in compliance', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    reportingService.getCheckinCompliance.mockResolvedValue({ cycle: null, byOwner: [] });
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['checkin-compliance'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('reports-router — unmatched routes', () => {
  it('returns 404 for an unrecognised report name', async () => {
    getAuthenticatedUser.mockReturnValue(TENANT_ADMIN);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['cross-tenant-adoption'] }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
