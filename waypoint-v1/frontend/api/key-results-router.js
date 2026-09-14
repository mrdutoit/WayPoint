import { getAuthenticatedUser } from '../api-lib/middleware/auth.js';
import { respondToServiceError } from '../api-lib/middleware/errorResponse.js';
import { withTenantContext } from '../api-lib/context/tenant.js';
import { updateKeyResult, getKeyResultById } from '../api-lib/services/keyResultService.js';
import { listInitiativesForKeyResult, createInitiative } from '../api-lib/services/initiativeService.js';
import { listCheckInsForKeyResult, createCheckIn } from '../api-lib/services/checkInService.js';
import { recordAuditEvent } from '../api-lib/services/auditService.js';
import { parseSlug } from '../api-lib/http/helpers.js';

// No CORS opening — same-origin frontend calls only.

export default async function handler(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Missing or invalid authorization token' });
  if (!user.tenantId) return res.status(403).json({ error: 'Key Results are tenant-scoped — not available to Platform Administrator' });

  const slugParts = parseSlug(req.query.slug);
  const [keyResultId, subResource] = slugParts;

  try {
    if (req.method === 'GET' && keyResultId && !subResource) return await getAction(req, res, user, keyResultId);
    if (req.method === 'PATCH' && keyResultId && !subResource) return await updateAction(req, res, user, keyResultId);
    if (req.method === 'POST' && keyResultId && subResource === 'initiatives') return await createInitiativeAction(req, res, user, keyResultId);
    if (req.method === 'GET' && keyResultId && subResource === 'initiatives') return await listInitiativesAction(req, res, user, keyResultId);
    if (req.method === 'POST' && keyResultId && subResource === 'check-ins') return await createCheckInAction(req, res, user, keyResultId);
    if (req.method === 'GET' && keyResultId && subResource === 'check-ins') return await listCheckInsAction(req, res, user, keyResultId);
    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    return respondToServiceError(res, err);
  }
}

// GET /api/key-results/:id — visibility follows the parent Objective's FR-020 rule.
async function getAction(req, res, user, keyResultId) {
  const keyResult = await withTenantContext(user.tenantId, (client) => getKeyResultById(client, user.tenantId, user, keyResultId));
  res.status(200).json({ keyResult });
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

// POST /api/key-results/:id/initiatives — Owner, Manager (FR-026, if enabled).
async function createInitiativeAction(req, res, user, keyResultId) {
  const { title, ownerId, dueDate } = req.body ?? {};

  const initiative = await withTenantContext(user.tenantId, async (client) => {
    const created = await createInitiative(client, user.tenantId, user, keyResultId, { title, ownerId, dueDate });
    await recordAuditEvent(client, {
      tenantId: user.tenantId, actorId: user.id,
      action: 'initiative.created', entityType: 'Initiative', entityId: created.id,
    });
    return created;
  });
  res.status(201).json({ initiative });
}

// GET /api/key-results/:id/initiatives — Owner, Manager (visibility follows the parent Objective's FR-020 rule).
async function listInitiativesAction(req, res, user, keyResultId) {
  const initiatives = await withTenantContext(user.tenantId, (client) => listInitiativesForKeyResult(client, user.tenantId, keyResultId));
  res.status(200).json({ initiatives });
}

// POST /api/key-results/:id/check-ins — Owner, Manager (FR-018, if enabled). Triggers the FR-019 roll-up.
async function createCheckInAction(req, res, user, keyResultId) {
  const { rubricLevelId, confidence, comment } = req.body ?? {};

  const checkIn = await withTenantContext(user.tenantId, async (client) => {
    const created = await createCheckIn(client, user.tenantId, user, keyResultId, { rubricLevelId, confidence, comment });
    await recordAuditEvent(client, {
      tenantId: user.tenantId, actorId: user.id,
      action: 'checkIn.created', entityType: 'CheckIn', entityId: created.id,
    });
    return created;
  });
  res.status(201).json({ checkIn });
}

// GET /api/key-results/:id/check-ins — Owner, Manager, Tenant Administrator.
async function listCheckInsAction(req, res, user, keyResultId) {
  const checkIns = await withTenantContext(user.tenantId, (client) => listCheckInsForKeyResult(client, user.tenantId, keyResultId));
  res.status(200).json({ checkIns });
}
