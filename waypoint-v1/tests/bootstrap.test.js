import { describe, it, expect, vi, afterEach } from 'vitest';

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn();
  res.end = vi.fn();
  return res;
}

function mockReq(overrides = {}) {
  return { method: 'GET', headers: {}, query: { slug: 'bootstrap' }, ...overrides };
}

describe('admin-router bootstrap auth guard', () => {
  const originalSecret = process.env.BOOTSTRAP_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.BOOTSTRAP_SECRET;
    else process.env.BOOTSTRAP_SECRET = originalSecret;
    vi.resetModules();
  });

  it('returns 404 for anything other than GET .../bootstrap', async () => {
    process.env.BOOTSTRAP_SECRET = 'correct-secret';
    vi.resetModules();
    const handler = (await import('../frontend/api/admin-router.js')).default;
    const res = mockRes();
    await handler(mockReq({ query: { slug: ['something-else'] } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('refuses every request when BOOTSTRAP_SECRET is unset (fail closed)', async () => {
    delete process.env.BOOTSTRAP_SECRET;
    vi.resetModules();
    const handler = (await import('../frontend/api/admin-router.js')).default;
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('rejects a wrong secret', async () => {
    process.env.BOOTSTRAP_SECRET = 'correct-secret';
    vi.resetModules();
    const handler = (await import('../frontend/api/admin-router.js')).default;
    const res = mockRes();
    await handler(mockReq({ headers: { 'x-bootstrap-secret': 'wrong-secret' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
