import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../frontend/api-lib/middleware/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  requireRole: (user, ...roles) => !!user && roles.includes(user.role),
}));
vi.mock('../frontend/api-lib/context/tenant.js', () => ({
  withTenantContext: (tenantId, fn) => fn({ query: vi.fn() }),
  withPlatformContext: (fn) => fn({ query: vi.fn() }),
}));
vi.mock('../frontend/api-lib/services/auditService.js', () => ({ recordAuditEvent: vi.fn() }));
vi.mock('../frontend/api-lib/services/objectiveService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listObjectivesForCaller: vi.fn(),
    getObjectiveForCaller: vi.fn(),
    createObjective: vi.fn(),
    updateObjective: vi.fn(),
  };
});
vi.mock('../frontend/api-lib/services/keyResultService.js', () => ({
  listKeyResultsForObjective: vi.fn(),
  createKeyResult: vi.fn(),
}));

const { getAuthenticatedUser } = await import('../frontend/api-lib/middleware/auth.js');
const objectiveService = await import('../frontend/api-lib/services/objectiveService.js');
const keyResultService = await import('../frontend/api-lib/services/keyResultService.js');
const handler = (await import('../frontend/api/objectives-router.js')).default;

function mockReq({ method, slug = [], body }) {
  return { method, query: { slug }, body, headers: {} };
}
function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const EMPLOYEE = { id: 'u1', tenantId: 't1', role: 'Employee' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('objectives-router — authentication', () => {
  it('returns 401 when there is no authenticated user', async () => {
    getAuthenticatedUser.mockReturnValue(null);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: [] }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 for a Platform Administrator (no tenant — objectives are tenant-scoped)', async () => {
    getAuthenticatedUser.mockReturnValue({ id: 'admin-1', tenantId: null, role: 'PlatformAdmin' });
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: [] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('objectives-router — POST /api/objectives (FR-015)', () => {
  it('rejects a TenantAdmin (only Manager/Employee may create)', async () => {
    getAuthenticatedUser.mockReturnValue({ id: 'admin-1', tenantId: 't1', role: 'TenantAdmin' });
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: [], body: { title: 'X', cascadeLevelId: 'cl1' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(objectiveService.createObjective).not.toHaveBeenCalled();
  });

  it('maps a ValidationError from the service to 400', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    objectiveService.createObjective.mockRejectedValue(new objectiveService.ValidationError('title is required'));
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: [], body: { cascadeLevelId: 'cl1' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'title is required' });
  });

  it('accepts a valid request and returns 201 with an audit trail (FR-007)', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    objectiveService.createObjective.mockResolvedValue({ id: 'obj-1', status: 'Not Started' });
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: [], body: { title: 'Grow revenue', cascadeLevelId: 'cl1' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ objective: { id: 'obj-1', status: 'Not Started' } });
  });
});

describe('objectives-router — GET /api/objectives/:id (FR-020)', () => {
  it('maps a ForbiddenError (not owner or their Manager) to 403', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    objectiveService.getObjectiveForCaller.mockRejectedValue(new objectiveService.ForbiddenError());
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['obj-1'] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('maps a NotFoundError to 404', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    objectiveService.getObjectiveForCaller.mockRejectedValue(new objectiveService.NotFoundError());
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['obj-missing'] }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns the Objective with its Key Results on success', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    objectiveService.getObjectiveForCaller.mockResolvedValue({ id: 'obj-1' });
    keyResultService.listKeyResultsForObjective.mockResolvedValue([{ id: 'kr-1' }]);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['obj-1'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ objective: { id: 'obj-1' }, keyResults: [{ id: 'kr-1' }] });
  });
});

describe('objectives-router — PATCH /api/objectives/:id never accepts status (FR-004)', () => {
  it('ignores a status field even if sent in the body', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    objectiveService.updateObjective.mockResolvedValue({ id: 'obj-1', title: 'New', status: 'Not Started' });
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', slug: ['obj-1'], body: { title: 'New', status: 'Achieved' } }), res);
    // the router only ever destructures { title, parentObjectiveId } from the body —
    // whatever the service was called with must not include status
    const callArgs = objectiveService.updateObjective.mock.calls[0];
    expect(callArgs[4]).toEqual({ title: 'New', parentObjectiveId: undefined });
  });
});

describe('objectives-router — POST /api/objectives/:id/key-results (FR-016)', () => {
  it('routes to createKeyResult and returns 201', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    keyResultService.createKeyResult.mockResolvedValue({ id: 'kr-1', status: 'Not Started' });
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: ['obj-1', 'key-results'], body: { title: 'Sign 10 clients' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ keyResult: { id: 'kr-1', status: 'Not Started' } });
  });

  it('maps a ForbiddenError from key result creation to 403', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    keyResultService.createKeyResult.mockRejectedValue(new objectiveService.ForbiddenError());
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: ['obj-1', 'key-results'], body: { title: 'X' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('objectives-router — unmatched routes', () => {
  it('returns 404 for an unrecognised method/path combination', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    const res = mockRes();
    await handler(mockReq({ method: 'DELETE', slug: ['obj-1'] }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
