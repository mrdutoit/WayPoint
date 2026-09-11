import { getAuthenticatedUser } from '../api-lib/middleware/auth.js';
import { respondToServiceError } from '../api-lib/middleware/errorResponse.js';
import { withTenantContext } from '../api-lib/context/tenant.js';
import { updateKeyResult } from '../api-lib/services/keyResultService.js';
import { recordAuditEvent } from '../api-lib/services/auditService.js';

// No CORS opening — same-origin frontend calls only.

export default async function handler(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Missing or invalid authorization token' });
  if (!user.tenantId) return res.status(403).json({ error: 'Key Results are tenant-scoped — not available to Platform Administrator' });

  const slugParts = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug].filter(Boolean);
  const [keyResultId] = slugParts;

  try {
    if (req.method === 'PATCH' && keyResultId) return await updateAction(req, res, user, keyResultId);
    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    return respondToServiceError(res, err);
  }
}

// PATCH /api/key-results/:id — Owner, Manager (FR-016). Not its status — FR-004.
async function updateAction(req, res, user, keyResultId) {
  const { title, weighting } = req.body ?? {};

  const keyResult = await withTenantContext(user.tenantId, async (client) => {
    const updated = await updateKeyResult(client, user.tenantId, user, keyResultId, { title, weighting });
    await recordAuditEvent(client, {
      tenantId: user.tenantId, actorId: user.id,
      action: 'keyResult.updated', entityType: 'KeyResult', entityId: updated.id,
    });
    return updated;
  });
  res.status(200).json({ keyResult });
}
