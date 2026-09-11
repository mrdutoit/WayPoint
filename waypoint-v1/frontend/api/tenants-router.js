import { getAuthenticatedUser, requireRole } from '../api-lib/middleware/auth.js';
import { respondToServiceError } from '../api-lib/middleware/errorResponse.js';
import { withPlatformContext } from '../api-lib/context/tenant.js';
import { listTenants, getTenant, createTenantWithFirstAdmin } from '../api-lib/services/tenantService.js';
import { recordAuditEvent } from '../api-lib/services/auditService.js';
import { parseSlug } from '../api-lib/http/helpers.js';

// No CORS opening — same-origin frontend calls only.

export default async function handler(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Missing or invalid authorization token' });
  if (!requireRole(user, 'PlatformAdmin')) return res.status(403).json({ error: 'Tenants are managed by Platform Administrator only' });

  const slugParts = parseSlug(req.query.slug);
  const [tenantId] = slugParts;

  try {
    if (req.method === 'GET' && !tenantId) return await listAction(req, res, user);
    if (req.method === 'POST' && !tenantId) return await createAction(req, res, user);
    if (req.method === 'GET' && tenantId) return await getAction(req, res, user, tenantId);
    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    return respondToServiceError(res, err);
  }
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
