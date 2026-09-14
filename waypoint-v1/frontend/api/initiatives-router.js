import { getAuthenticatedUser } from '../api-lib/middleware/auth.js';
import { respondToServiceError } from '../api-lib/middleware/errorResponse.js';
import { withTenantContext } from '../api-lib/context/tenant.js';
import { updateInitiative } from '../api-lib/services/initiativeService.js';
import { recordAuditEvent } from '../api-lib/services/auditService.js';
import { parseSlug } from '../api-lib/http/helpers.js';

// No CORS opening — same-origin frontend calls only.

export default async function handler(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Missing or invalid authorization token' });
  if (!user.tenantId) return res.status(403).json({ error: 'Initiatives are tenant-scoped — not available to Platform Administrator' });

  const slugParts = parseSlug(req.query.slug);
  const [initiativeId] = slugParts;

  try {
    if (req.method === 'PATCH' && initiativeId) return await updateAction(req, res, user, initiativeId);
    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    return respondToServiceError(res, err);
  }
}

// PATCH /api/initiatives/:id — Owner, Manager (FR-026).
async function updateAction(req, res, user, initiativeId) {
  const { title, status, dueDate } = req.body ?? {};

  const initiative = await withTenantContext(user.tenantId, async (client) => {
    const updated = await updateInitiative(client, user.tenantId, user, initiativeId, { title, status, dueDate });
    await recordAuditEvent(client, {
      tenantId: user.tenantId, actorId: user.id,
      action: 'initiative.updated', entityType: 'Initiative', entityId: updated.id,
    });
    return updated;
  });
  res.status(200).json({ initiative });
}
