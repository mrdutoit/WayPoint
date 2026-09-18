import { describe, it, expect, vi } from 'vitest';
import { recordAuditEvent, diffFields, listAuditEvents, exportAuditEvents } from '../frontend/api-lib/services/auditService.js';

function mockClient(rows) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

describe('recordAuditEvent', () => {
  it('inserts entityLabel and JSON-stringified changes when given', async () => {
    const client = mockClient([]);
    await recordAuditEvent(client, {
      tenantId: 't1', actorId: 'u1', action: 'objective.updated', entityType: 'Objective', entityId: 'obj-1',
      entityLabel: 'Grow net revenue by 20%',
      changes: [{ field: 'title', from: 'Grow revenue', to: 'Grow net revenue by 20%' }],
    });
    const [, params] = client.query.mock.calls[0];
    expect(params[6]).toBe('Grow net revenue by 20%'); // entityLabel
    expect(JSON.parse(params[7])).toEqual([{ field: 'title', from: 'Grow revenue', to: 'Grow net revenue by 20%' }]);
  });

  it('stores null for entityLabel/changes when omitted, not undefined or "undefined"', async () => {
    const client = mockClient([]);
    await recordAuditEvent(client, { tenantId: 't1', actorId: 'u1', action: 'user.login', entityType: 'UserAccount', entityId: 'u1' });
    const [, params] = client.query.mock.calls[0];
    expect(params[6]).toBeNull();
    expect(params[7]).toBeNull();
  });
});

describe('diffFields', () => {
  it('returns only the fields that actually changed', () => {
    const changes = diffFields({ title: 'A', weighting: 2 }, { title: 'B', weighting: 2 }, ['title', 'weighting']);
    expect(changes).toEqual([{ field: 'title', from: 'A', to: 'B' }]);
  });

  it('returns an empty array when nothing in the field list changed', () => {
    expect(diffFields({ title: 'A' }, { title: 'A' }, ['title'])).toEqual([]);
  });

  it('treats missing/undefined values as null on both sides', () => {
    const changes = diffFields({}, { title: 'New' }, ['title']);
    expect(changes).toEqual([{ field: 'title', from: null, to: 'New' }]);
  });

  it('handles before being null entirely (first-time configuration, e.g. a rubric that did not exist yet)', () => {
    const changes = diffFields(null, { name: 'Default' }, ['name']);
    expect(changes).toEqual([{ field: 'name', from: null, to: 'Default' }]);
  });

  // The actual bug caught and fixed while building this: array/object
  // fields (e.g. cascade level labels) are never === across two
  // separate arrays even when their contents are identical, so a naive
  // !== comparison would call every save "changed". diffFields compares
  // the serialised form instead.
  it('compares array fields by value, not by reference', () => {
    const changes = diffFields({ labels: ['Company', 'Team'] }, { labels: ['Company', 'Team'] }, ['labels']);
    expect(changes).toEqual([]);
  });

  it('still detects a real change within an array field', () => {
    const changes = diffFields({ labels: ['Company', 'Team'] }, { labels: ['Company', 'Division'] }, ['labels']);
    expect(changes).toEqual([{ field: 'labels', from: ['Company', 'Team'], to: ['Company', 'Division'] }]);
  });

  it('compares object fields by value too', () => {
    expect(diffFields({ meta: { a: 1 } }, { meta: { a: 1 } }, ['meta'])).toEqual([]);
    expect(diffFields({ meta: { a: 1 } }, { meta: { a: 2 } }, ['meta'])).toEqual([{ field: 'meta', from: { a: 1 }, to: { a: 2 } }]);
  });

  it('ignores fields outside the given list even if they differ', () => {
    const changes = diffFields({ title: 'A', secret: 'x' }, { title: 'A', secret: 'y' }, ['title']);
    expect(changes).toEqual([]);
  });
});

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
