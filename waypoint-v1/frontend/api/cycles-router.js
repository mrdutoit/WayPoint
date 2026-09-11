import { getAuthenticatedUser, requireRole } from '../api-lib/middleware/auth.js';
import { respondToServiceError } from '../api-lib/middleware/errorResponse.js';
import { withTenantContext } from '../api-lib/context/tenant.js';
import { getCyclesForTenant, createCycle } from '../api-lib/services/cycleService.js';
import { recordAuditEvent } from '../api-lib/services/auditService.js';
import { parseSlug } from '../api-lib/http/helpers.js';

// No CORS opening — same-origin frontend calls only, as with flags-router.js.
//
// No activate action any more — "active" is computed from today's date
// against each Cycle's [start_date, end_date] (see cycleService.js's
// module comment). POST /api/cycles/:id/activate is retired.

export default async function handler(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Missing or invalid authorization token' });
  if (!user.tenantId) return res.status(403).json({ error: 'Cycles are tenant-scoped — not available to Platform Administrator' });

  const slugParts = parseSlug(req.query.slug);
  const [cycleId] = slugParts;

  try {
    if (req.method === 'GET' && !cycleId) return await listAction(req, res, user);
    if (req.method === 'POST' && !cycleId) return await createAction(req, res, user);
    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    return respondToServiceError(res, err);
  }
}

async function listAction(req, res, user) {
  const cycles = await withTenantContext(user.tenantId, (client) => getCyclesForTenant(client, user.tenantId));
  res.status(200).json({ cycles });
}

// POST /api/cycles — Tenant Administrator only (FR-014). end_date is
// always server-computed from startDate + the Cadence's months, never
// accepted from the caller.
async function createAction(req, res, user) {
  if (!requireRole(user, 'TenantAdmin')) return res.status(403).json({ error: 'Forbidden for this role' });
  const { name, cadenceId, startDate } = req.body ?? {};

  const cycle = await withTenantContext(user.tenantId, async (client) => {
    const created = await createCycle(client, user.tenantId, { name, cadenceId, startDate });
    await recordAuditEvent(client, {
      tenantId: user.tenantId, actorId: user.id,
      action: 'cycle.created', entityType: 'Cycle', entityId: created.id,
    });
    return created;
  });
  res.status(201).json({ cycle });
}
