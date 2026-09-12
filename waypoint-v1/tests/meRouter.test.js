import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../frontend/api-lib/middleware/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
}));
vi.mock('../frontend/api-lib/context/tenant.js', () => ({
  withTenantContext: (tenantId, fn) => fn({ query: vi.fn() }),
  withPlatformContext: (fn) => fn({ query: vi.fn() }),
}));
vi.mock('../frontend/api-lib/services/profileService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getOwnProfile: vi.fn(), updateOwnProfile: vi.fn() };
});

const { getAuthenticatedUser } = await import('../frontend/api-lib/middleware/auth.js');
const profileService = await import('../frontend/api-lib/services/profileService.js');
const { ValidationError } = await import('../frontend/api-lib/services/errors.js');
const handler = (await import('../frontend/api/me-router.js')).default;

function mockReq({ method, slug = [], body }) {
  return { method, query: { slug: slug.length > 0 ? slug.join('/') : undefined }, body, headers: {} };
}
function mockRes() { const res = {}; res.status = vi.fn().mockReturnValue(res); res.json = vi.fn().mockReturnValue(res); return res; }

const EMPLOYEE = { id: 'u1', tenantId: 't1', role: 'Employee' };
const PLATFORM_ADMIN = { id: 'admin-1', tenantId: null, role: 'PlatformAdmin' };

beforeEach(() => vi.clearAllMocks());

describe('me-router — authentication', () => {
  it('returns 401 without an authenticated user', async () => {
    getAuthenticatedUser.mockReturnValue(null);
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('me-router — works for a tenant user and for PlatformAdmin alike', () => {
  it('GET works for a tenant Employee', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    profileService.getOwnProfile.mockResolvedValue({ id: 'u1', theme: 'light', avatarOption: 'grad' });
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('GET works for PlatformAdmin, who has no tenant', async () => {
    getAuthenticatedUser.mockReturnValue(PLATFORM_ADMIN);
    profileService.getOwnProfile.mockResolvedValue({ id: 'admin-1', theme: 'dark', avatarOption: 'blue' });
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ profile: { id: 'admin-1', theme: 'dark', avatarOption: 'blue' } });
  });
});

describe('me-router — PATCH', () => {
  it('accepts a valid update', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    profileService.updateOwnProfile.mockResolvedValue({ id: 'u1', theme: 'dark', avatarOption: 'grad' });
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', body: { theme: 'dark' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('maps a ValidationError (unknown theme) to 400', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    profileService.updateOwnProfile.mockRejectedValue(new ValidationError('theme must be one of: light, dark'));
    const res = mockRes();
    await handler(mockReq({ method: 'PATCH', body: { theme: 'neon' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('me-router — unmatched routes', () => {
  it('returns 404 for a sub-path (this endpoint takes no id)', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', slug: ['something'] }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 for an unsupported method', async () => {
    getAuthenticatedUser.mockReturnValue(EMPLOYEE);
    const res = mockRes();
    await handler(mockReq({ method: 'DELETE' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
