import { getAuthenticatedUser, requireRole } from '../api-lib/middleware/auth.js';
import { respondToServiceError } from '../api-lib/middleware/errorResponse.js';
import { withTenantContext } from '../api-lib/context/tenant.js';
import { getCascadeLevelsForTenant, setCascadeLevelsForTenant } from '../api-lib/services/cascadeLevelService.js';
import { getRubricForTenant, setRubricForTenant, DEFAULT_RUBRIC_LEVELS } from '../api-lib/services/scoringRubricService.js';
import { recordAuditEvent } from '../api-lib/services/auditService.js';

// No CORS opening — same-origin frontend calls only.

export default async function handler(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Missing or invalid authorization token' });
  if (!user.tenantId) return res.status(403).json({ error: 'Settings are tenant-scoped — not available to Platform Administrator' });

  const slugParts = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug].filter(Boolean);
  const resource = slugParts[0]; // 'cascade-levels' | 'rubric'

  try {
    if (req.method === 'GET' && resource === 'cascade-levels') return await getCascadeLevelsAction(req, res, user);
    if (req.method === 'PUT' && resource === 'cascade-levels') return await putCascadeLevelsAction(req, res, user);
    if (req.method === 'GET' && resource === 'rubric') return await getRubricAction(req, res, user);
    if (req.method === 'PUT' && resource === 'rubric') return await putRubricAction(req, res, user);
    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    return respondToServiceError(res, err);
  }
}

// GET /api/settings/cascade-levels — all authenticated tenant users (FR-012).
async function getCascadeLevelsAction(req, res, user) {
  const levels = await withTenantContext(user.tenantId, (client) => getCascadeLevelsForTenant(client, user.tenantId));
  res.status(200).json({ levels });
}

// PUT /api/settings/cascade-levels — Tenant Administrator only (FR-012).
async function putCascadeLevelsAction(req, res, user) {
  if (!requireRole(user, 'TenantAdmin')) return res.status(403).json({ error: 'Forbidden for this role' });
  const { labels } = req.body ?? {};

  const levels = await withTenantContext(user.tenantId, async (client) => {
    const updated = await setCascadeLevelsForTenant(client, user.tenantId, labels);
    await recordAuditEvent(client, {
      tenantId: user.tenantId, actorId: user.id,
      action: 'cascadeLevels.updated', entityType: 'CascadeLevel', entityId: user.tenantId,
    });
    return updated;
  });
  res.status(200).json({ levels });
}

// GET /api/settings/rubric — all authenticated tenant users. Not in the
// literal Stage 2 API table (only PUT is listed) — added because a
// settings screen and Key Result creation both need to read the current
// rubric, not just write it. Returns null (not 404) when nothing has
// been configured yet, since "not configured" is an expected state, not
// an error, before the first PUT.
async function getRubricAction(req, res, user) {
  const rubric = await withTenantContext(user.tenantId, (client) => getRubricForTenant(client, user.tenantId));
  res.status(200).json({ rubric, defaultLevels: rubric ? undefined : DEFAULT_RUBRIC_LEVELS });
}

// PUT /api/settings/rubric — Tenant Administrator only (FR-017).
async function putRubricAction(req, res, user) {
  if (!requireRole(user, 'TenantAdmin')) return res.status(403).json({ error: 'Forbidden for this role' });
  const { name, levels } = req.body ?? {};

  const rubric = await withTenantContext(user.tenantId, async (client) => {
    const updated = await setRubricForTenant(client, user.tenantId, { name, levels });
    await recordAuditEvent(client, {
      tenantId: user.tenantId, actorId: user.id,
      action: 'rubric.updated', entityType: 'ScoringRubric', entityId: updated.id,
    });
    return updated;
  });
  res.status(200).json({ rubric });
}
