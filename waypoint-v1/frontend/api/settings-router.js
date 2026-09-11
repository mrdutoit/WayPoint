import { getAuthenticatedUser, requireRole } from '../api-lib/middleware/auth.js';
import { respondToServiceError } from '../api-lib/middleware/errorResponse.js';
import { withTenantContext } from '../api-lib/context/tenant.js';
import { getCascadeLevelsForTenant, setCascadeLevelsForTenant } from '../api-lib/services/cascadeLevelService.js';
import { getRubricForTenant, setRubricForTenant, DEFAULT_RUBRIC_LEVELS } from '../api-lib/services/scoringRubricService.js';
import { listCadencesForTenant, createCadence, updateCadence, deleteCadence } from '../api-lib/services/cadenceService.js';
import { getElementConfigForTenant, setElementEnabled } from '../api-lib/services/okrElementConfigService.js';
import { getTerminologyForTenant, setTerminologyForTenant } from '../api-lib/services/terminologyService.js';
import { recordAuditEvent } from '../api-lib/services/auditService.js';
import { parseSlug } from '../api-lib/http/helpers.js';

// No CORS opening — same-origin frontend calls only.

export default async function handler(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Missing or invalid authorization token' });
  if (!user.tenantId) return res.status(403).json({ error: 'Settings are tenant-scoped — not available to Platform Administrator' });

  const slugParts = parseSlug(req.query.slug);
  const resource = slugParts[0]; // 'cascade-levels' | 'rubric' | 'cadences' | 'okr-elements' | 'terminology'
  const cadenceId = resource === 'cadences' ? slugParts[1] : undefined;
  const elementKey = resource === 'okr-elements' ? slugParts[1] : undefined;

  try {
    if (req.method === 'GET' && resource === 'cascade-levels') return await getCascadeLevelsAction(req, res, user);
    if (req.method === 'PUT' && resource === 'cascade-levels') return await putCascadeLevelsAction(req, res, user);
    if (req.method === 'GET' && resource === 'rubric') return await getRubricAction(req, res, user);
    if (req.method === 'PUT' && resource === 'rubric') return await putRubricAction(req, res, user);
    if (req.method === 'GET' && resource === 'cadences' && !cadenceId) return await listCadencesAction(req, res, user);
    if (req.method === 'POST' && resource === 'cadences' && !cadenceId) return await createCadenceAction(req, res, user);
    if (req.method === 'PATCH' && resource === 'cadences' && cadenceId) return await updateCadenceAction(req, res, user, cadenceId);
    if (req.method === 'DELETE' && resource === 'cadences' && cadenceId) return await deleteCadenceAction(req, res, user, cadenceId);
    if (req.method === 'GET' && resource === 'okr-elements' && !elementKey) return await getOkrElementsAction(req, res, user);
    if (req.method === 'PATCH' && resource === 'okr-elements' && elementKey) return await patchOkrElementAction(req, res, user, elementKey);
    if (req.method === 'GET' && resource === 'terminology') return await getTerminologyAction(req, res, user);
    if (req.method === 'PUT' && resource === 'terminology') return await putTerminologyAction(req, res, user);
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

// GET /api/settings/cadences — all authenticated tenant users.
async function listCadencesAction(req, res, user) {
  const cadences = await withTenantContext(user.tenantId, (client) => listCadencesForTenant(client, user.tenantId));
  res.status(200).json({ cadences });
}

// POST /api/settings/cadences — Tenant Administrator only.
async function createCadenceAction(req, res, user) {
  if (!requireRole(user, 'TenantAdmin')) return res.status(403).json({ error: 'Forbidden for this role' });
  const { label, months } = req.body ?? {};

  const cadence = await withTenantContext(user.tenantId, async (client) => {
    const created = await createCadence(client, user.tenantId, { label, months });
    await recordAuditEvent(client, {
      tenantId: user.tenantId, actorId: user.id,
      action: 'cadence.created', entityType: 'Cadence', entityId: created.id,
    });
    return created;
  });
  res.status(201).json({ cadence });
}

// PATCH /api/settings/cadences/:id — Tenant Administrator only. Refused
// (409) once the Cadence is used by any Cycle — see cadenceService.js.
async function updateCadenceAction(req, res, user, cadenceId) {
  if (!requireRole(user, 'TenantAdmin')) return res.status(403).json({ error: 'Forbidden for this role' });
  const { label, months } = req.body ?? {};

  const cadence = await withTenantContext(user.tenantId, async (client) => {
    const updated = await updateCadence(client, user.tenantId, cadenceId, { label, months });
    await recordAuditEvent(client, {
      tenantId: user.tenantId, actorId: user.id,
      action: 'cadence.updated', entityType: 'Cadence', entityId: updated.id,
    });
    return updated;
  });
  res.status(200).json({ cadence });
}

// DELETE /api/settings/cadences/:id — Tenant Administrator only. Same
// in-use guard as PATCH.
async function deleteCadenceAction(req, res, user, cadenceId) {
  if (!requireRole(user, 'TenantAdmin')) return res.status(403).json({ error: 'Forbidden for this role' });

  await withTenantContext(user.tenantId, async (client) => {
    await deleteCadence(client, user.tenantId, cadenceId);
    await recordAuditEvent(client, {
      tenantId: user.tenantId, actorId: user.id,
      action: 'cadence.deleted', entityType: 'Cadence', entityId: cadenceId,
    });
  });
  res.status(204).end();
}

// GET /api/settings/okr-elements — all authenticated tenant users (FR-025).
async function getOkrElementsAction(req, res, user) {
  const elements = await withTenantContext(user.tenantId, (client) => getElementConfigForTenant(client, user.tenantId));
  res.status(200).json({ elements });
}

// PATCH /api/settings/okr-elements/:elementKey — Tenant Administrator
// only (FR-025). Body: { isEnabled: boolean }.
async function patchOkrElementAction(req, res, user, elementKey) {
  if (!requireRole(user, 'TenantAdmin')) return res.status(403).json({ error: 'Forbidden for this role' });
  const { isEnabled } = req.body ?? {};

  const elements = await withTenantContext(user.tenantId, async (client) => {
    const updated = await setElementEnabled(client, user.tenantId, elementKey, !!isEnabled);
    await recordAuditEvent(client, {
      tenantId: user.tenantId, actorId: user.id,
      action: 'okrElement.updated', entityType: 'OkrElementConfig', entityId: elementKey,
    });
    return updated;
  });
  res.status(200).json({ elements });
}

// GET /api/settings/terminology — all authenticated tenant users (FR-013).
async function getTerminologyAction(req, res, user) {
  const terms = await withTenantContext(user.tenantId, (client) => getTerminologyForTenant(client, user.tenantId));
  res.status(200).json({ terms });
}

// PUT /api/settings/terminology — Tenant Administrator only (FR-013).
async function putTerminologyAction(req, res, user) {
  if (!requireRole(user, 'TenantAdmin')) return res.status(403).json({ error: 'Forbidden for this role' });
  const overrides = req.body ?? {};

  const terms = await withTenantContext(user.tenantId, async (client) => {
    const updated = await setTerminologyForTenant(client, user.tenantId, overrides);
    await recordAuditEvent(client, {
      tenantId: user.tenantId, actorId: user.id,
      action: 'terminology.updated', entityType: 'TerminologySetting', entityId: user.tenantId,
    });
    return updated;
  });
  res.status(200).json({ terms });
}
