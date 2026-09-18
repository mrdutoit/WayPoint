import { randomUUID } from 'crypto';

/**
 * Records a significant action to the audit_log table (FR-007). Must be
 * called from inside an existing withTenantContext/withPlatformContext
 * transaction so the write shares the same RLS session context and the
 * same commit/rollback boundary as the action it is recording.
 */
export async function recordAuditEvent(client, entry) {
  await client.query(
    `INSERT INTO okr.audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, "timestamp")
     VALUES ($1, $2, $3, $4, $5, $6, now())`,
    [randomUUID(), entry.tenantId, entry.actorId, entry.action, entry.entityType, entry.entityId ?? null]
  );
}

/**
 * The read side (FR-031 §"List audit log entries") — added 2026-09-17.
 * Until now `recordAuditEvent` was the only export from this file:
 * events were being written by 7 routers and never read back by
 * anything, for any role, confirmed by grep rather than assumed.
 *
 * Deliberately does NOT take a tenantId parameter. Tenant scoping is the
 * router's job, expressed by *which context function* it opens the
 * transaction with: withTenantContext(tenantId, ...) makes RLS return
 * only that tenant's rows; withPlatformContext(...) makes RLS return
 * every tenant's rows (audit_log's tenant_isolation policy, schema.sql).
 * This function only adds pagination on top of whatever RLS already
 * scoped the connection to.
 */
const AUDIT_LOG_FIELDS = `
  al.id, al.tenant_id AS "tenantId", al.actor_id AS "actorId", al.action,
  al.entity_type AS "entityType", al.entity_id AS "entityId", al."timestamp",
  actor.first_name AS "actorFirstName", actor.last_name AS "actorLastName",
  t.name AS "tenantName"
`;
const AUDIT_LOG_JOINS = `
  FROM okr.audit_log al
  LEFT JOIN okr.user_account actor ON actor.id = al.actor_id
  LEFT JOIN okr.tenant t ON t.id = al.tenant_id
`;

export async function listAuditEvents(client, { before, limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const conditions = [];
  const params = [];
  if (before) {
    params.push(before);
    conditions.push(`al."timestamp" < $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(safeLimit);
  const { rows } = await client.query(
    `SELECT ${AUDIT_LOG_FIELDS} ${AUDIT_LOG_JOINS} ${where} ORDER BY al."timestamp" DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

/**
 * FR-031 §"Export as CSV/JSON for a date range" — no LIMIT (a bounded
 * date range is the caller's own size control, same as List's `before`
 * cursor is List's), full range if no dates given.
 */
export async function exportAuditEvents(client, { startDate, endDate } = {}) {
  const conditions = [];
  const params = [];
  if (startDate) {
    params.push(startDate);
    conditions.push(`al."timestamp" >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`al."timestamp" < $${params.length}::date + interval '1 day'`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await client.query(
    `SELECT ${AUDIT_LOG_FIELDS} ${AUDIT_LOG_JOINS} ${where} ORDER BY al."timestamp" DESC`,
    params
  );
  return rows;
}
