import { getAuthenticatedUser, requireRole } from '../api-lib/middleware/auth.js';
import { respondToServiceError } from '../api-lib/middleware/errorResponse.js';
import { withTenantContext, withPlatformContext } from '../api-lib/context/tenant.js';
import { listTenants, getTenant, createTenantWithFirstAdmin } from '../api-lib/services/tenantService.js';
import { exportTenantData, formatExportAsJson, formatExportAsCsvZip } from '../api-lib/services/exportService.js';
import { recordAuditEvent, listAuditEvents, exportAuditEvents } from '../api-lib/services/auditService.js';
import { rowsToCsv } from '../api-lib/csv.js';
import { parseSlug } from '../api-lib/http/helpers.js';

// No CORS opening — same-origin frontend calls only.

export default async function handler(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Missing or invalid authorization token' });

  // FR-031's audit-log endpoints are served from THIS file via
  // vercel.json's ?resource=audit-log rewrite — not because audit-log
  // belongs to tenant management, but to stay under Vercel's 12-function
  // Hobby ceiling (this project has hit that before — see app-builder
  // skill's own note on it, and reference.md). It shares nothing else
  // with the tenants resource below and is checked first, independent
  // of the tenantId-slug routing that follows.
  if (req.query.resource === 'audit-log') {
    const slug = parseSlug(req.query.slug);
    try {
      if (req.method === 'GET' && slug[0] === 'export') return await auditExportAction(req, res, user);
      if (req.method === 'GET' && slug.length === 0) return await auditListAction(req, res, user);
      return res.status(404).json({ error: 'Not found' });
    } catch (err) {
      return respondToServiceError(res, err);
    }
  }

  const slugParts = parseSlug(req.query.slug);
  const [tenantId, subResource] = slugParts;

  try {
    // GET /api/tenants/:id/export — the one route on this file NOT
    // restricted to PlatformAdmin (FR-030: Tenant Administrator can
    // export their own tenant too) — checked before the blanket
    // PlatformAdmin gate below applies to everything else.
    if (req.method === 'GET' && tenantId && subResource === 'export') {
      return await exportAction(req, res, user, tenantId);
    }

    if (!requireRole(user, 'PlatformAdmin')) {
      return res.status(403).json({ error: 'Tenants are managed by Platform Administrator only' });
    }

    if (req.method === 'GET' && !tenantId) return await listAction(req, res, user);
    if (req.method === 'POST' && !tenantId) return await createAction(req, res, user);
    if (req.method === 'GET' && tenantId && !subResource) return await getAction(req, res, user, tenantId);
    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    return respondToServiceError(res, err);
  }
}

// GET /api/audit-log?limit=&before=&tenantId= — FR-031. Tenant
// Administrator: own tenant only (tenantId query param ignored — always
// forced to their own). Platform Administrator: every tenant by
// default, or one specific tenant via ?tenantId=. `before` is a
// timestamp cursor (the oldest row's "timestamp" from the previous
// page) for simple keyset pagination through an append-only log.
async function auditListAction(req, res, user) {
  const isPlatformAdmin = requireRole(user, 'PlatformAdmin');
  const isTenantAdmin = requireRole(user, 'TenantAdmin');
  if (!isPlatformAdmin && !isTenantAdmin) {
    return res.status(403).json({ error: 'Audit log access is limited to Tenant Administrator (own tenant) and Platform Administrator' });
  }

  const { before } = req.query;
  const limit = req.query.limit ? Number(req.query.limit) : 50;

  const runList = (client) => listAuditEvents(client, { before, limit });
  const events = isTenantAdmin
    ? await withTenantContext(user.tenantId, runList)
    : (req.query.tenantId ? await withTenantContext(req.query.tenantId, runList) : await withPlatformContext(runList));

  res.status(200).json({
    events,
    nextBefore: events.length > 0 && events.length === Math.max(1, Math.min(limit, 200)) ? events[events.length - 1].timestamp : null,
  });
}

// GET /api/audit-log/export?format=json|csv&startDate=&endDate=&tenantId=
// — FR-031. Same access split as List above. A single CSV (not a zip
// like Data Export) — this is one entity, not six different shapes.
async function auditExportAction(req, res, user) {
  const isPlatformAdmin = requireRole(user, 'PlatformAdmin');
  const isTenantAdmin = requireRole(user, 'TenantAdmin');
  if (!isPlatformAdmin && !isTenantAdmin) {
    return res.status(403).json({ error: 'Audit log access is limited to Tenant Administrator (own tenant) and Platform Administrator' });
  }

  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const { startDate, endDate } = req.query;
  // null (not undefined) when this is a true cross-tenant PlatformAdmin
  // export — there is no single tenant to scope the transaction or the
  // audit entry to, matching audit_log.tenant_id's own nullability for
  // platform-level actions (schema.sql).
  const exportTenantId = isTenantAdmin ? user.tenantId : (req.query.tenantId || null);

  async function runExport(client) {
    const result = await exportAuditEvents(client, { startDate, endDate });
    // Exporting the audit log is itself worth its own trail entry — the
    // same "bulk export" security-review item Kai raised for FR-030
    // applies here too, not just to OKR data.
    await recordAuditEvent(client, {
      tenantId: exportTenantId, actorId: user.id,
      action: 'auditLog.exported', entityType: 'AuditLog', entityId: null,
    });
    return result;
  }

  const events = exportTenantId
    ? await withTenantContext(exportTenantId, runExport)
    : await withPlatformContext(runExport);

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'csv') {
    const csv = rowsToCsv(
      ['id', 'tenantId', 'tenantName', 'actorId', 'actorFirstName', 'actorLastName', 'action', 'entityType', 'entityId', 'timestamp'],
      events
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="waypoint-audit-log-${stamp}.csv"`);
    return res.status(200).send(csv);
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="waypoint-audit-log-${stamp}.json"`);
  return res.status(200).send(JSON.stringify({ events }, null, 2));
}

// GET /api/tenants — list all tenants. Beyond the literal Stage 2 API
// table (which only lists GET /api/tenants/:id) — a PlatformAdmin has no
// way to discover a tenant's id without this, so the table's own GET/:id
// entry is unreachable in practice without it.
async function listAction(req, res, user) {
  const tenants = await withPlatformContext((client) => listTenants(client));
  res.status(200).json({ tenants });
}

async function getAction(req, res, user, tenantId) {
  const tenant = await withPlatformContext((client) => getTenant(client, tenantId));
  res.status(200).json({ tenant });
}

// GET /api/tenants/:id/export?format=json|csv — FR-030. Platform
// Administrator: any tenant. Tenant Administrator: own tenant only.
// Defaults to json when format is missing or unrecognised.
async function exportAction(req, res, user, tenantId) {
  const isPlatformAdmin = requireRole(user, 'PlatformAdmin');
  const isOwnTenantAdmin = requireRole(user, 'TenantAdmin') && user.tenantId === tenantId;
  if (!isPlatformAdmin && !isOwnTenantAdmin) {
    return res.status(403).json({ error: "You can only export your own tenant's data" });
  }

  const format = req.query.format === 'csv' ? 'csv' : 'json';

  // withTenantContext(tenantId, ...) is correct for both roles here —
  // it scopes RLS to the TARGET tenant regardless of who's asking, so
  // PlatformAdmin exporting someone else's tenant does not need
  // withPlatformContext (that bypasses RLS entirely, which this neither
  // needs nor wants for a request that already names exactly one tenant).
  const data = await withTenantContext(tenantId, async (client) => {
    const result = await exportTenantData(client, tenantId);
    await recordAuditEvent(client, {
      tenantId, actorId: user.id,
      action: 'tenant.exported', entityType: 'Tenant', entityId: tenantId,
    });
    return result;
  });

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'csv') {
    const buffer = await formatExportAsCsvZip(data);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="waypoint-export-${stamp}.zip"`);
    return res.status(200).send(buffer);
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="waypoint-export-${stamp}.json"`);
  return res.status(200).send(formatExportAsJson(data));
}

// POST /api/tenants — creates the tenant and its first TenantAdmin
// together (FR-011). The admin-typed password forces a change at next
// login (password_must_change) — see userService.js's module comment.
async function createAction(req, res, user) {
  const { name, region, adminEmail, adminFirstName, adminLastName, adminPassword } = req.body ?? {};

  let result;
  try {
    result = await withPlatformContext(async (client) => {
      const created = await createTenantWithFirstAdmin(
        client,
        { name, region },
        { email: adminEmail, firstName: adminFirstName, lastName: adminLastName, password: adminPassword }
      );
      await recordAuditEvent(client, {
        tenantId: created.tenant.id, actorId: user.id,
        action: 'tenant.created', entityType: 'Tenant', entityId: created.tenant.id,
      });
      await recordAuditEvent(client, {
        tenantId: created.tenant.id, actorId: user.id,
        action: 'user.invited', entityType: 'UserAccount', entityId: created.tenantAdmin.id,
      });
      return created;
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with this email address already exists' });
    }
    throw err;
  }

  res.status(201).json(result);
}
