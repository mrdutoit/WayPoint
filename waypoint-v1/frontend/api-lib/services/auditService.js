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
