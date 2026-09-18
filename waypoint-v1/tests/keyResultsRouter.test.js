import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../frontend/api-lib/middleware/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  requireRole: (user, ...roles) => !!user && roles.includes(user.role),
}));
vi.mock('../frontend/api-lib/context/tenant.js', () => ({
  withTenantContext: (tenantId, fn) => fn({ query: vi.fn() }),
}));
vi.mock('../frontend/api-lib/services/auditService.js', () => ({
  recordAuditEvent: vi.fn(),
  diffFields: vi.fn((before, after, fields) => fields.filter((f) => before?.[f] !== after?.[f]).map((f) => ({ field: f, from: before?.[f] ?? null, to: after?.[f] ?? null }))),
}));
vi.mock('../frontend/api-lib/services/keyResultService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, updateKeyResult: vi.fn(), getKeyResultById: vi.fn() };
});
vi.mock('../frontend/api-lib/services/initiativeService.js', () => ({
  createInitiative: vi.fn(), listInitiativesForKeyResult: vi.fn(), updateInitiative: vi.fn(),
}));
vi.mock('../frontend/api-lib/services/checkInService.js', () => ({
  createCheckIn: vi.fn(), listCheckInsForKeyResult: vi.fn(),
}));

const { getAuthenticatedUser } = await import('../frontend/api-lib/middleware/auth.js');
const keyResultService = await import('../frontend/api-lib/services/keyResultService.js');
const initiativeService = await import('../frontend/api-lib/services/initiativeService.js');
const checkInService = await import('../frontend/api-lib/services/checkInService.js');
const { ForbiddenError, NotFoundError } = await import('../frontend/api-lib/services/errors.js');
const handler = (await import('../frontend/api/key-results-router.js')).default;

function mockReq({ method, slug = [], body }) {
  // Simulates the real Vercel rewrite shape (a slash-joined string, or
  // absent for the bare path) rather than a pre-split array — see
  // api-lib/http/helpers.js's parseSlug for why that distinction is the
  // whole point of this test harness shape.
  return { method, query: { slug: slug.length > 0 ? slug.join('/') : undefined }, body, headers: {} };
}
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

describe('key-results-router — POST /api/key-results/:id/initiatives', () => {
  it('creates an Initiative', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    initiativeService.createInitiative.mockResolvedValue({ id: 'init-1', title: 'Ship it' });
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: ['kr-1', 'initiatives'], body: { title: 'Ship it' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('maps a disabled-element ValidationError to 400', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    const { ValidationError } = await import('../frontend/api-lib/services/errors.js');
    initiativeService.createInitiative.mockRejectedValue(new ValidationError('Initiatives are disabled'));
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: ['kr-1', 'initiatives'], body: { title: 'x' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('key-results-router — GET /api/key-results/:id/initiatives', () => {
  it('lists Initiatives', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    initiativeService.listInitiativesForKeyResult.mockResolvedValue([{ id: 'init-1' }]);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['kr-1', 'initiatives'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('key-results-router — POST /api/key-results/:id/check-ins', () => {
  it('submits a Check-in', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    checkInService.createCheckIn.mockResolvedValue({ id: 'ci-1' });
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: ['kr-1', 'check-ins'], body: { rubricLevelId: 'rl-1', confidence: 4 } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('maps a ForbiddenError to 403', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    checkInService.createCheckIn.mockRejectedValue(new ForbiddenError());
    const res = mockRes();
    await handler(mockReq({ method: 'POST', slug: ['kr-1', 'check-ins'], body: { rubricLevelId: 'rl-1', confidence: 4 } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('key-results-router — GET /api/key-results/:id/check-ins', () => {
  it('lists Check-ins', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    checkInService.listCheckInsForKeyResult.mockResolvedValue([{ id: 'ci-1' }]);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['kr-1', 'check-ins'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('key-results-router — unmatched sub-resources', () => {
  it('returns 404 for an unrecognised sub-resource', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['kr-1', 'something-else'] }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('key-results-router — GET /api/key-results/:id', () => {
  it('returns the Key Result', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    keyResultService.getKeyResultById.mockResolvedValue({ id: 'kr-1', title: 'Sign 10 clients' });
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['kr-1'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('maps a ForbiddenError to 403', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    keyResultService.getKeyResultById.mockRejectedValue(new ForbiddenError());
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['kr-1'] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('maps a NotFoundError to 404', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    keyResultService.getKeyResultById.mockRejectedValue(new NotFoundError());
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['kr-missing'] }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
