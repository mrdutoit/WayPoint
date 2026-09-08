import { getAuthenticatedUser, requireRole } from '../api-lib/middleware/auth.js';
import { withTenantContext, withPlatformContext } from '../api-lib/context/tenant.js';
import { getFlagsForTenant, setTenantFlag } from '../api-lib/services/flagService.js';
import { recordAuditEvent } from '../api-lib/services/auditService.js';

// No CORS opening on this file — called only by the real frontend, same
// origin as this function (both deployed from the same Vercel project).

export default async function handler(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Missing or invalid authorization token' });

  const slugParts = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug].filter(Boolean);
  const flagKey = slugParts[0]; // present only for PATCH /api/flags/:key

  if (req.method === 'GET' && !flagKey) return listFlags(req, res, user);
  if (req.method === 'PATCH' && flagKey) return updateFlag(req, res, user, flagKey);

  return res.status(404).json({ error: 'Not found' });
}

// GET /api/flags — tenant users get their own tenant's resolved flags; a
// PlatformAdmin (no tenant, FR-003) gets platform-wide defaults only.
async function listFlags(req, res, user) {
  const flags = user.tenantId
    ? await withTenantContext(user.tenantId, (client) => getFlagsForTenant(client, user.tenantId))
    : await withPlatformContext((client) => getFlagsForTenant(client, null));
  res.status(200).json({ flags });
}

// PATCH /api/flags/:key — Platform Administrator only (FR-001).
async function updateFlag(req, res, user, flagKey) {
  if (!requireRole(user, 'PlatformAdmin')) {
    return res.status(403).json({ error: 'Forbidden for this role' });
  }
  const { value, valueType, tenantId } = req.body ?? {};
  if (value === undefined || !valueType) {
    return res.status(400).json({ error: 'value and valueType are required' });
  }
  if (!['boolean', 'enum'].includes(valueType)) {
    return res.status(400).json({ error: 'valueType must be "boolean" or "enum"' });
  }
  const targetTenantId = tenantId ?? user.tenantId ?? null;
  const runInContext = targetTenantId
    ? (fn) => withTenantContext(targetTenantId, fn)
    : (fn) => withPlatformContext(fn);

  await runInContext(async (client) => {
    await setTenantFlag(client, { tenantId: targetTenantId, flagKey, valueType, value });
    await recordAuditEvent(client, {
      tenantId: targetTenantId, actorId: user.id,
      action: 'flag.updated', entityType: 'FeatureFlag', entityId: flagKey,
    });
  });

  res.status(200).json({ message: 'Flag updated' });
}
