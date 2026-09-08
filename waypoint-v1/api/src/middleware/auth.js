import { verifyToken } from '../services/authService.js';

/**
 * Verifies the bearer token and attaches { id, tenantId, role } to req.user.
 * Does not enforce role — see requireRole() below for that, applied per
 * route so each endpoint's role list stays visible next to the route
 * definition (matching the Roles column in the Stage 2 API design table).
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, tenantId: payload.tenantId, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * requireRole('TenantAdmin', 'PlatformAdmin') — role check applied after
 * requireAuth. Kept separate from requireAuth so public/health routes
 * never accidentally inherit a role check.
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden for this role' });
    }
    next();
  };
}
