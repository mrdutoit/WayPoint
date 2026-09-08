import { withTenantContext, withPlatformContext } from '../db.js';
import { getFlagsForTenant, setTenantFlag } from '../services/flagService.js';
import { recordAuditEvent } from '../services/auditService.js';

// GET /api/flags — tenant users get their own tenant's resolved flags;
// a PlatformAdmin (no tenant, FR-003) gets platform-wide defaults only.
export async function listFlagsHandler(req, res) {
  const flags = req.user.tenantId
    ? await withTenantContext(req.user.tenantId, (client) => getFlagsForTenant(client, req.user.tenantId))
    : await withPlatformContext((client) => getFlagsForTenant(client, null));
  res.status(200).json({ flags });
}

// PATCH /api/flags/:key — Platform Administrator only (FR-001). Tenant
// Administrators never reach this route — see routes.js requireRole list.
export async function updateFlagHandler(req, res) {
  const { key } = req.params;
  const { value, valueType, tenantId } = req.body ?? {};
  if (!key || value === undefined || !valueType) {
    return res.status(400).json({ error: 'key, value, and valueType are required' });
  }
  if (!['boolean', 'enum'].includes(valueType)) {
    return res.status(400).json({ error: 'valueType must be "boolean" or "enum"' });
  }
  const targetTenantId = tenantId ?? req.user.tenantId ?? null;
  const runInContext = targetTenantId
    ? (fn) => withTenantContext(targetTenantId, fn)
    : (fn) => withPlatformContext(fn);

  await runInContext(async (client) => {
    await setTenantFlag(client, { tenantId: targetTenantId, flagKey: key, valueType, value });
    await recordAuditEvent(client, {
      tenantId: targetTenantId, actorId: req.user.id,
      action: 'flag.updated', entityType: 'FeatureFlag', entityId: key,
    });
  });

  res.status(200).json({ message: 'Flag updated' });
}
