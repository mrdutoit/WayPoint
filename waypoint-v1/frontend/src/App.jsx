import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { RoleProvider, useRole, ROLES } from './context/RoleContext.jsx';
import { FlagProvider } from './context/FlagContext.jsx';
import { TerminologyProvider, useTerms } from './context/TerminologyContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { useWindowSize } from './hooks/useWindowSize.js';
import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import FeatureFlags from './pages/FeatureFlags.jsx';
import Objectives from './pages/Objectives.jsx';
import ObjectiveDetail from './pages/ObjectiveDetail.jsx';
import OkrSettings from './pages/OkrSettings.jsx';
import TenantsAdmin from './pages/TenantsAdmin.jsx';
import UsersAdmin from './pages/UsersAdmin.jsx';
import Settings from './pages/Settings.jsx';
import { Logo } from './components/Logo.jsx';
import { Avatar } from './components/Avatar.jsx';
import { s, colors } from './styles/tokens.js';

function Shell({ children }) {
  const { user, setUser, role, isPlatformAdmin, isTenantAdmin } = useRole();
  const { isMobile } = useWindowSize();
  const { tPlural } = useTerms();
  const previewMode = !user;

  return (
    <div>
      <nav style={s.navBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Logo size={22} />
          {!isMobile && (
            <>
              <Link to="/" style={{ color: colors.ink700, textDecoration: 'none', fontSize: 14 }}>Dashboard</Link>
              <Link to="/objectives" style={{ color: colors.ink700, textDecoration: 'none', fontSize: 14 }}>{tPlural('Objective')}</Link>
              {isTenantAdmin && (
                <>
                  <Link to="/okr-settings" style={{ color: colors.ink700, textDecoration: 'none', fontSize: 14 }}>
                    OKR Settings
                  </Link>
                  <Link to="/users" style={{ color: colors.ink700, textDecoration: 'none', fontSize: 14 }}>
                    Users
                  </Link>
                </>
              )}
              {isPlatformAdmin && (
                <>
                  <Link to="/tenants" style={{ color: colors.ink700, textDecoration: 'none', fontSize: 14 }}>
                    Tenants
                  </Link>
                  <Link to="/admin/flags" style={{ color: colors.ink700, textDecoration: 'none', fontSize: 14 }}>
                    Feature Flags
                  </Link>
                </>
              )}
            </>
          )}
        </div>
        {previewMode ? (
          <select
            style={{ ...s.select, width: 200 }}
            value={role ?? ''}
            onChange={(e) => setUser(e.target.value ? { id: 'preview-user', tenantId: e.target.value === 'PlatformAdmin' ? null : 'preview-tenant', email: 'preview@waypoint.app', role: e.target.value } : null)}
          >
            <option value="">Preview role…</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link to="/change-password" style={{ color: colors.ink500, textDecoration: 'none', fontSize: 13 }}>
              Change password
            </Link>
            <Link to="/settings" style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.ink700, textDecoration: 'none', fontSize: 13 }}>
              <Avatar firstName={user?.firstName} lastName={user?.lastName} avatarOption={user?.avatarOption} size={28} />
              {!isMobile && 'Settings'}
            </Link>
            <button onClick={() => setUser(null)} style={s.btnSecondary}>Sign out</button>
          </div>
        )}
      </nav>
      {children}
    </div>
  );
}

function RequireAuth({ children }) {
  const { user } = useRole();
  if (!user) return <Navigate to="/login" replace />;
  // An admin-set password (invite or force-reset) always forces a change
  // before anything else in the app is reachable — see ChangePassword.jsx
  // and auth-router.js's change-password handler.
  if (user.passwordMustChange) return <ChangePassword forced />;
  return children;
}

function RequireRole({ roles, children }) {
  const { role } = useRole();
  if (!roles.includes(role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <RoleProvider>
      <ThemeProvider>
      <TerminologyProvider>
        <FlagProvider>
          <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/change-password"
              element={<RequireAuth><Shell><ChangePassword /></Shell></RequireAuth>}
            />
            <Route
              path="/settings"
              element={<RequireAuth><Shell><Settings /></Shell></RequireAuth>}
            />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Shell><Dashboard /></Shell>
                </RequireAuth>
              }
            />
            <Route
              path="/admin/flags"
              element={
                <RequireAuth>
                  <RequireRole roles={['PlatformAdmin']}>
                    <Shell><FeatureFlags /></Shell>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/objectives"
              element={<RequireAuth><Shell><Objectives /></Shell></RequireAuth>}
            />
            <Route
              path="/objectives/:id"
              element={<RequireAuth><Shell><ObjectiveDetail /></Shell></RequireAuth>}
            />
            <Route
              path="/okr-settings"
              element={
                <RequireAuth>
                  <RequireRole roles={['TenantAdmin']}>
                    <Shell><OkrSettings /></Shell>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/users"
              element={
                <RequireAuth>
                  <RequireRole roles={['TenantAdmin']}>
                    <Shell><UsersAdmin /></Shell>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/tenants"
              element={
                <RequireAuth>
                  <RequireRole roles={['PlatformAdmin']}>
                    <Shell><TenantsAdmin /></Shell>
                  </RequireRole>
                </RequireAuth>
              }
            />
          </Routes>
          </BrowserRouter>
        </FlagProvider>
      </TerminologyProvider>
      </ThemeProvider>
    </RoleProvider>
  );
}
