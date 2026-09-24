import { createContext, useContext, useState, useEffect } from 'react';
import { meApi, getAuthToken, clearAuthToken } from '../services/api.js';
import { decodeToken, isTokenExpired } from '../utils/jwt.js';

export const ROLES = ['PlatformAdmin', 'TenantAdmin', 'Manager', 'Employee'];

const RoleContext = createContext(null);

// Reconstructs `user` from whatever token api.js restored from
// localStorage at module load — this is the actual fix for the
// refresh-logs-you-out bug. email/firstName/lastName aren't in the JWT
// (issueToken only signs sub/tenantId/role), so those stay unset here;
// the enrichment effect below fills them in via GET /api/me, exactly
// the same way it already does right after a fresh login.
function restoreUserFromStoredToken() {
  const token = getAuthToken();
  if (!token) return null;
  const payload = decodeToken(token);
  if (!payload || isTokenExpired(payload)) {
    clearAuthToken(); // stale or unreadable — don't keep trying to use it
    return null;
  }
  return { id: payload.sub, tenantId: payload.tenantId, role: payload.role };
}

export function RoleProvider({ children, initialUser = null }) {
  const [user, setUser] = useState(() => initialUser ?? restoreUserFromStoredToken());

  // firstName/lastName/theme/avatarOption aren't in the JWT (issueToken
  // only signs sub/tenantId/role) — this is the one place `user` gets
  // enriched with them, once, right after login, rather than each
  // consumer (Avatar, ThemeContext, Settings) doing its own separate
  // GET /api/me and racing to be first.
  useEffect(() => {
    if (!user || user.passwordMustChange || user.firstName || user.id === 'preview-user') return;
    meApi.get()
      .then((result) => {
        if (result?.profile) setUser((prev) => (prev ? { ...prev, ...result.profile } : prev));
      })
      .catch(() => {}); // best-effort — nav/Settings just show less until a retry
  }, [user?.id, user?.passwordMustChange]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
    user,
    setUser,
    role: user?.role ?? null,
    isPlatformAdmin: user?.role === 'PlatformAdmin',
    isTenantAdmin: user?.role === 'TenantAdmin',
    isManager: user?.role === 'Manager',
    isEmployee: user?.role === 'Employee',
    isAdminOrAbove: user?.role === 'PlatformAdmin' || user?.role === 'TenantAdmin',
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within a RoleProvider');
  return ctx;
}
