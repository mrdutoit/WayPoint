import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/src/db.js', () => ({
  pool: { query: vi.fn() },
}));

const { pool } = await import('../api/src/db.js');
const { healthHandler } = await import('../api/src/functions/health.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('healthHandler', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  it('returns 200 when the database is reachable', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const res = mockRes();
    await healthHandler({ log: { error: vi.fn() } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'ok', database: 'reachable' });
  });

  it('returns 503 when the database is unreachable', async () => {
    pool.query.mockRejectedValueOnce(new Error('connection refused'));
    const res = mockRes();
    await healthHandler({ log: { error: vi.fn() } }, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', database: 'unreachable' });
  });
});
