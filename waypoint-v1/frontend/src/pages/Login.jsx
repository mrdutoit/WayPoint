import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, setAuthToken } from '../services/api.js';
import { useRole } from '../context/RoleContext.jsx';
import { Logo } from '../components/Logo.jsx';
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
      setAuthToken(result.token);
      // Decoded client-side only to drive the nav — every request is
      // still verified server-side regardless of what this shows.
      const payload = JSON.parse(atob(result.token.split('.')[1]));
      setUser({ id: payload.sub, tenantId: payload.tenantId, role: payload.role, email });
      navigate('/');
    } catch (err) {
      setError(err.message ?? 'Invalid email or password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: colors.ink50 }}>
      <form onSubmit={handleSubmit} style={{ ...s.card, width: 360 }}>
        <div style={{ marginBottom: 20 }}>
          <Logo size={32} withWordmark />
        </div>
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
          {submitting ? 'Signing in\u2026' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
