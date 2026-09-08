import { verifyToken } from '../services/authService.js';

/**
 * Not Express middleware (there's no Express app here — each file under
 * api/ is its own Vercel Function) — a plain helper each router file
 * calls at the top of any route that needs an authenticated caller.
 * Returns { id, tenantId, role } or null; the caller decides what a
 * null means for that specific route (401, or in bootstrap-router's
 * case, nothing — it uses its own secret instead).
 */
export function getAuthenticatedUser(req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    return { id: payload.sub, tenantId: payload.tenantId, role: payload.role };
  } catch {
    return null;
  }
}

export function requireRole(user, ...allowedRoles) {
  return !!user && allowedRoles.includes(user.role);
}
