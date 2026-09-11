import { getAuthenticatedUser, requireRole } from '../api-lib/middleware/auth.js';
import { respondToServiceError } from '../api-lib/middleware/errorResponse.js';
import { withTenantContext } from '../api-lib/context/tenant.js';
import { listUsersForTenant, inviteUser, updateUserRole, forcePasswordResetForUser } from '../api-lib/services/userService.js';
import { recordAuditEvent } from '../api-lib/services/auditService.js';
import { parseSlug } from '../api-lib/http/helpers.js';

// No CORS opening — same-origin frontend calls only.

export default async function handler(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Missing or invalid authorization token' });
  if (!user.tenantId) return res.status(403).json({ error: 'User management is tenant-scoped — not available to Platform Administrator' });
  if (!requireRole(user, 'TenantAdmin')) return res.status(403).json({ error: 'Forbidden for this role' });

  const slugParts = parseSlug(req.query.slug);
  const [first, second, third] = slugParts;

  try {
    if (req.method === 'GET' && !first) return await listAction(req, res, user);
    if (req.method === 'POST' && first === 'invite' && !second) return await inviteAction(req, res, user);
    if (req.method === 'PATCH' && first && second === 'role' && !third) return await roleAction(req, res, user, first);
    if (req.method === 'PUT' && first && second === 'force-password-reset' && !third) return await forceResetAction(req, res, user, first);
    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    return respondToServiceError(res, err);
  }
}

// GET /api/users — Tenant Administrator.
async function listAction(req, res, user) {
  const users = await withTenantContext(user.tenantId, (client) => listUsersForTenant(client, user.tenantId));
  res.status(200).json({ users });
}

// POST /api/users/invite — Tenant Administrator (Manager or Employee only).
// The admin-typed password forces a change at next login — see
// userService.js's module comment.
async function inviteAction(req, res, user) {
  const { role, email, firstName, lastName, password, managerId } = req.body ?? {};

  let created;
  try {
    created = await withTenantContext(user.tenantId, async (client) => {
      const invited = await inviteUser(client, user.tenantId, { role, email, firstName, lastName, password, managerId });
      await recordAuditEvent(client, {
        tenantId: user.tenantId, actorId: user.id,
        action: 'user.invited', entityType: 'UserAccount', entityId: invited.id,
      });
      return invited;
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with this email address already exists' });
    }
    throw err;
  }
  res.status(201).json({ user: created });
}

// PATCH /api/users/:id/role — Tenant Administrator.
async function roleAction(req, res, user, targetUserId) {
  const { role } = req.body ?? {};
  const updated = await withTenantContext(user.tenantId, async (client) => {
    const result = await updateUserRole(client, user.tenantId, targetUserId, role);
    await recordAuditEvent(client, {
      tenantId: user.tenantId, actorId: user.id,
      action: 'user.role_changed', entityType: 'UserAccount', entityId: result.id,
    });
    return result;
  });
  res.status(200).json({ user: updated });
}

// PUT /api/users/:id/force-password-reset — Tenant Administrator.
// Deliberate addition beyond the literal Stage 2 API table (which has no
// self-service email flow to fall back on yet — see auth-router.js's
// TODO) — mirrors MedBroker's force-password-reset (§118).
async function forceResetAction(req, res, user, targetUserId) {
  const { password } = req.body ?? {};
  const result = await withTenantContext(user.tenantId, async (client) => {
    const reset = await forcePasswordResetForUser(client, user.tenantId, targetUserId, password);
    await recordAuditEvent(client, {
      tenantId: user.tenantId, actorId: user.id,
      action: 'user.password_force_reset', entityType: 'UserAccount', entityId: reset.id,
    });
    return reset;
  });
  res.status(200).json({ user: result });
}
