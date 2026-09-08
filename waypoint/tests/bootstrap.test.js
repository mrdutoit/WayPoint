import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('bootstrapHandler auth guard', () => {
  const originalSecret = process.env.BOOTSTRAP_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.BOOTSTRAP_SECRET;
    else process.env.BOOTSTRAP_SECRET = originalSecret;
    vi.resetModules();
  });

  it('refuses every request when BOOTSTRAP_SECRET is unset (fail closed)', async () => {
    delete process.env.BOOTSTRAP_SECRET;
    vi.resetModules();
    const { bootstrapHandler } = await import('../api/src/functions/admin.js');
    const res = mockRes();
    await bootstrapHandler({ headers: {}, log: { info: vi.fn(), error: vi.fn() } }, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('rejects a wrong secret', async () => {
    process.env.BOOTSTRAP_SECRET = 'correct-secret';
    vi.resetModules();
    const { bootstrapHandler } = await import('../api/src/functions/admin.js');
    const res = mockRes();
    await bootstrapHandler(
      { headers: { 'x-bootstrap-secret': 'wrong-secret' }, log: { info: vi.fn(), error: vi.fn() } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
