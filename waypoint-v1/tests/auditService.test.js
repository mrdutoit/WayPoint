import { describe, it, expect, vi } from 'vitest';
import { listAuditEvents, exportAuditEvents } from '../frontend/api-lib/services/auditService.js';

function mockClient(rows) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

describe('listAuditEvents', () => {
  it('orders by timestamp descending and defaults to a limit of 50', async () => {
    const client = mockClient([{ id: 'e1' }]);
    await listAuditEvents(client);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/ORDER BY al\."timestamp" DESC/);
    expect(sql).not.toMatch(/WHERE/);
    expect(params).toEqual([50]);
  });

  it('adds a "before" cursor condition when given one, for keyset pagination', async () => {
    const client = mockClient([]);
    await listAuditEvents(client, { before: '2026-09-01T00:00:00.000Z', limit: 20 });
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/WHERE al\."timestamp" < \$1/);
    expect(params).toEqual(['2026-09-01T00:00:00.000Z', 20]);
  });

  it('clamps an over-large limit to 200', async () => {
    const client = mockClient([]);
    await listAuditEvents(client, { limit: 5000 });
    const [, params] = client.query.mock.calls[0];
    expect(params).toEqual([200]);
  });

  it('clamps a zero/negative/non-numeric limit up to 1, not down to nothing', async () => {
    const client = mockClient([]);
    await listAuditEvents(client, { limit: -5 });
    expect(client.query.mock.calls[0][1]).toEqual([1]);

    const client2 = mockClient([]);
    await listAuditEvents(client2, { limit: 'not-a-number' });
    expect(client2.query.mock.calls[0][1]).toEqual([50]); // falls back to the default
  });

  it('joins actor and tenant names for display, left-joined so a deleted actor does not hide the event', async () => {
    const client = mockClient([]);
    await listAuditEvents(client);
    const [sql] = client.query.mock.calls[0];
    expect(sql).toMatch(/LEFT JOIN okr\.user_account actor/);
    expect(sql).toMatch(/LEFT JOIN okr\.tenant t/);
  });
});

describe('exportAuditEvents', () => {
  it('applies no filter and no LIMIT when no date range is given (a bounded export, not a full-table scan by accident — see module comment)', async () => {
    const client = mockClient([]);
    await exportAuditEvents(client);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).not.toMatch(/WHERE/);
    expect(sql).not.toMatch(/LIMIT/);
    expect(params).toEqual([]);
  });

  it('filters by startDate (inclusive) and endDate (exclusive, end of day)', async () => {
    const client = mockClient([]);
    await exportAuditEvents(client, { startDate: '2026-09-01', endDate: '2026-09-17' });
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/al\."timestamp" >= \$1/);
    expect(sql).toMatch(/al\."timestamp" < \$2::date \+ interval '1 day'/);
    expect(params).toEqual(['2026-09-01', '2026-09-17']);
  });

  it('applies only startDate when endDate is omitted', async () => {
    const client = mockClient([]);
    await exportAuditEvents(client, { startDate: '2026-09-01' });
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/al\."timestamp" >= \$1/);
    expect(sql).not.toMatch(/endDate|<\s*\$2/);
    expect(params).toEqual(['2026-09-01']);
  });
});
