import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, setAuthToken } from '../services/api.js';
import { useRole } from '../context/RoleContext.jsx';
import { s, colors } from '../styles/tokens.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useRole();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await authApi.login(email, password);
      if (result?.token) {
        setAuthToken(result.token);
        // Decode just the payload for role/tenant — a real implementation
        // verifies this server-side on every request regardless; this is
        // only used to drive the nav, never trusted for access control.
        const payload = JSON.parse(atob(result.token.split('.')[1]));
        setUser({ id: payload.sub, tenantId: payload.tenantId, role: payload.role });
        navigate('/');
      } else {
        // Preview mode (no backend configured) — let the role switcher in
        // App.jsx stand in for login instead.
        setError('Sign-in is not configured in this preview. Use the role switcher above.');
      }
    } catch (err) {
      setError(err.message ?? 'Invalid email or password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: colors.ink50 }}>
      <form onSubmit={handleSubmit} style={{ ...s.card, width: 360 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: colors.ink900 }}>Waypoint</h1>
        <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 20 }}>Sign in to your organisation</p>

        <label style={s.label} htmlFor="email">Email</label>
        <input
          id="email" type="email" required autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ ...s.formInput, marginBottom: 14 }}
        />

        <label style={s.label} htmlFor="password">Password</label>
        <input
          id="password" type="password" required autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ ...s.formInput, marginBottom: 14 }}
        />

        {error && (
          <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginBottom: 14, display: 'block' }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} style={{ ...s.btnPrimary, width: '100%' }}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
