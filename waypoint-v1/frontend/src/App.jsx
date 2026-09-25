import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './shell.css';
import { RoleProvider, useRole, ROLES } from './context/RoleContext.jsx';
import { clearAuthToken } from './services/api.js';
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
import KeyResultDetail from './pages/KeyResultDetail.jsx';
import Reports from './pages/Reports.jsx';
import Scorecard from './pages/Scorecard.jsx';
import TeamProgress from './pages/TeamProgress.jsx';
import AlignmentMap from './pages/AlignmentMap.jsx';
import CheckinCompliance from './pages/CheckinCompliance.jsx';
import OkrSettings from './pages/OkrSettings.jsx';
import TenantsAdmin from './pages/TenantsAdmin.jsx';
import UsersAdmin from './pages/UsersAdmin.jsx';
import AuditLog from './pages/AuditLog.jsx';
import Settings from './pages/Settings.jsx';
import { Logo } from './components/Logo.jsx';
import { Avatar } from './components/Avatar.jsx';
import { s, colors } from './styles/tokens.js';

function Shell({ children }) {
  const { user, setUser, role, isPlatformAdmin, isTenantAdmin } = useRole();
  const { isMobile } = useWindowSize();
  const { tPlural } = useTerms();
  const { pathname } = useLocation();
  const previewMode = !user;

  // 2026-09-25 nav redesign: sticky translucent bar, active-page pill,
  // and — new — the same links on mobile as a scrollable row under the
  // bar (previously mobile had no navigation at all beyond the logo).
  const links = [
    ['/', 'Dashboard', true],
    ['/objectives', tPlural('Objective'), true],
    ['/reports', 'Reports', true],
    ['/okr-settings', 'OKR settings', isTenantAdmin],
    ['/users', 'Users', isTenantAdmin],
    ['/tenants', 'Tenants', isPlatformAdmin],
    ['/admin/flags', 'Feature flags', isPlatformAdmin],
    ['/audit-log', 'Audit log', isTenantAdmin || isPlatformAdmin],
  ].filter(([, , show]) => show);
  const isActive = (to) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)
    || (to === '/objectives' && pathname.startsWith('/key-results')));
  const navLinks = links.map(([to, label]) => (
    <Link key={to} to={to} className={`wp-nav-link${isActive(to) ? ' active' : ''}`} aria-current={isActive(to) ? 'page' : undefined}>{label}</Link>
  ));

  return (
    <div>
      <nav className="wp-nav">
        <div className="wp-nav-inner">
          <div className="wp-nav-left">
            <Link to="/" className="wp-nav-logo" aria-label="WayPoint home"><Logo size={24} /></Link>
            {!isMobile && <div className="wp-nav-links">{navLinks}</div>}
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
            <div className="wp-nav-right">
              {!isMobile && <Link to="/change-password" className="wp-nav-quiet">Change password</Link>}
              <Link to="/settings" className={`wp-nav-me${pathname === '/settings' ? ' active' : ''}`}>
                <Avatar firstName={user?.firstName} lastName={user?.lastName} avatarOption={user?.avatarOption} size={28} />
                {!isMobile && <span>{user?.firstName ?? 'Settings'}</span>}
              </Link>
              <button type="button" className="wp-nav-signout" onClick={() => { clearAuthToken(); setUser(null); }}>Sign out</button>
            </div>
          )}
        </div>
        {isMobile && !previewMode && <div className="wp-nav-mobile">{navLinks}</div>}
      </nav>
      <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
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
              path="/key-results/:id"
              element={<RequireAuth><Shell><KeyResultDetail /></Shell></RequireAuth>}
            />
            <Route
              path="/reports"
              element={<RequireAuth><Shell><Reports /></Shell></RequireAuth>}
            />
            <Route
              path="/reports/scorecard/:userId"
              element={<RequireAuth><Shell><Scorecard /></Shell></RequireAuth>}
            />
            <Route
              path="/reports/team-progress"
              element={
                <RequireAuth>
                  <RequireRole roles={['Manager']}>
                    <Shell><TeamProgress /></Shell>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/reports/alignment-map"
              element={<RequireAuth><Shell><AlignmentMap /></Shell></RequireAuth>}
            />
            <Route
              path="/reports/checkin-compliance"
              element={
                <RequireAuth>
                  <RequireRole roles={['TenantAdmin']}>
                    <Shell><CheckinCompliance /></Shell>
                  </RequireRole>
                </RequireAuth>
              }
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
            <Route
              path="/audit-log"
              element={
                <RequireAuth>
                  <RequireRole roles={['TenantAdmin', 'PlatformAdmin']}>
                    <Shell><AuditLog /></Shell>
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
