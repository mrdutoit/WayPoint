import { getAuthenticatedUser, requireRole } from '../api-lib/middleware/auth.js';
import { respondToServiceError } from '../api-lib/middleware/errorResponse.js';
import { withTenantContext } from '../api-lib/context/tenant.js';
import {
  listObjectivesForCaller, getObjectiveForCaller, createObjective, updateObjective,
} from '../api-lib/services/objectiveService.js';
import { listKeyResultsForObjective, createKeyResult } from '../api-lib/services/keyResultService.js';
import { recordAuditEvent } from '../api-lib/services/auditService.js';

// No CORS opening — same-origin frontend calls only.

export default async function handler(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Missing or invalid authorization token' });
  if (!user.tenantId) return res.status(403).json({ error: 'Objectives are tenant-scoped — not available to Platform Administrator' });

  const slugParts = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug].filter(Boolean);
  const [objectiveId, subResource] = slugParts;

  try {
    if (req.method === 'GET' && !objectiveId) return await listAction(req, res, user);
    if (req.method === 'POST' && !objectiveId) return await createAction(req, res, user);
    if (req.method === 'GET' && objectiveId && !subResource) return await getAction(req, res, user, objectiveId);
    if (req.method === 'PATCH' && objectiveId && !subResource) return await updateAction(req, res, user, objectiveId);
    if (req.method === 'POST' && objectiveId && subResource === 'key-results') {
      return await createKeyResultAction(req, res, user, objectiveId);
    }
    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    return respondToServiceError(res, err);
  }
}

// GET /api/objectives — visible to caller (FR-020: owner + owner's direct Manager only).
async function listAction(req, res, user) {
  const objectives = await withTenantContext(user.tenantId, (client) => listObjectivesForCaller(client, user.tenantId, user));
  res.status(200).json({ objectives });
}

// GET /api/objectives/:id — includes its Key Results, same visibility rule as the list.
async function getAction(req, res, user, objectiveId) {
  const result = await withTenantContext(user.tenantId, async (client) => {
    const objective = await getObjectiveForCaller(client, user.tenantId, objectiveId, user);
    const keyResults = await listKeyResultsForObjective(client, user.tenantId, objectiveId);
    return { objective, keyResults };
  });
  res.status(200).json(result);
}

// POST /api/objectives — Manager, Employee (FR-015).
async function createAction(req, res, user) {
  if (!requireRole(user, 'Manager', 'Employee')) return res.status(403).json({ error: 'Forbidden for this role' });
  const { title, cascadeLevelId, parentObjectiveId, ownerId } = req.body ?? {};

  const objective = await withTenantContext(user.tenantId, async (client) => {
    const created = await createObjective(client, user.tenantId, user, { title, cascadeLevelId, parentObjectiveId, ownerId });
    await recordAuditEvent(client, {
      tenantId: user.tenantId, actorId: user.id,
      action: 'objective.created', entityType: 'Objective', entityId: created.id,
    });
    return created;
  });
  res.status(201).json({ objective });
}

// PATCH /api/objectives/:id — Owner, Manager (FR-020). Status is never accepted — FR-004.
async function updateAction(req, res, user, objectiveId) {
  const { title, parentObjectiveId } = req.body ?? {};

  const objective = await withTenantContext(user.tenantId, async (client) => {
    const updated = await updateObjective(client, user.tenantId, user, objectiveId, { title, parentObjectiveId });
    await recordAuditEvent(client, {
      tenantId: user.tenantId, actorId: user.id,
      action: 'objective.updated', entityType: 'Objective', entityId: updated.id,
    });
    return updated;
  });
  res.status(200).json({ objective });
}

// POST /api/objectives/:id/key-results — Owner, Manager (FR-016).
async function createKeyResultAction(req, res, user, objectiveId) {
  const { title, weighting, rubricId } = req.body ?? {};

  const keyResult = await withTenantContext(user.tenantId, async (client) => {
    const created = await createKeyResult(client, user.tenantId, user, objectiveId, { title, weighting, rubricId });
    await recordAuditEvent(client, {
      tenantId: user.tenantId, actorId: user.id,
      action: 'keyResult.created', entityType: 'KeyResult', entityId: created.id,
    });
    return created;
  });
  res.status(201).json({ keyResult });
}
