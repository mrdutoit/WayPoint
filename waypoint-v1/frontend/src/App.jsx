import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { RoleProvider, useRole, ROLES } from './context/RoleContext.jsx';
import { FlagProvider } from './context/FlagContext.jsx';
import { useWindowSize } from './hooks/useWindowSize.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import FeatureFlags from './pages/FeatureFlags.jsx';
import { s, colors } from './styles/tokens.js';

function Shell({ children }) {
  const { user, setUser, role, isPlatformAdmin } = useRole();
  const { isMobile } = useWindowSize();

  // Preview-mode role switcher — stands in for login when no auth backend
  // is configured (see services/api.js PREVIEW_MODE). Never rendered once
  // a real token is present.
  const previewMode = !user;

  return (
    <div>
      <nav style={s.navBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ fontWeight: 700, color: colors.brand600 }}>Waypoint</span>
          {!isMobile && (
            <>
              <Link to="/" style={{ color: colors.ink700, textDecoration: 'none', fontSize: 14 }}>Dashboard</Link>
              {isPlatformAdmin && (
                <Link to="/admin/flags" style={{ color: colors.ink700, textDecoration: 'none', fontSize: 14 }}>
                  Feature Flags
                </Link>
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
          <button onClick={() => setUser(null)} style={s.btnSecondary}>Sign out</button>
        )}
      </nav>
      {children}
    </div>
  );
}

function RequireAuth({ children }) {
  const { user } = useRole();
  // In preview mode there is no real session — the role switcher above
  // sets a stand-in user, which is enough to explore the shell. In
  // production, an absent user always redirects to /login.
  if (!user) return <Navigate to="/login" replace />;
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
      <FlagProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
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
          </Routes>
        </BrowserRouter>
      </FlagProvider>
    </RoleProvider>
  );
}
