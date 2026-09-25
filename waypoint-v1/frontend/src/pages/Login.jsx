import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, setAuthToken } from '../services/api.js';
import { decodeToken } from '../utils/jwt.js';
import { useRole } from '../context/RoleContext.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import { s } from '../styles/tokens.js';

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
      const payload = decodeToken(result.token);
      setUser({ id: payload.sub, tenantId: payload.tenantId, role: payload.role, email, passwordMustChange: result.passwordMustChange });
      navigate('/');
    } catch (err) {
      setError(err.message ?? 'Invalid email or password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="auth-title">Sign in</h1>
      <p className="auth-sub">Welcome back. Sign in to your organisation.</p>
      <form onSubmit={handleSubmit} className="auth-form">
        <label>
          Email
          <input id="email" type="email" required autoComplete="email" autoFocus
            value={email} onChange={(e) => setEmail(e.target.value)} style={s.formInput} />
        </label>
        <label>
          Password
          <input id="password" type="password" required autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} style={s.formInput} />
        </label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button type="submit" disabled={submitting} className="auth-submit">
          {submitting ? 'Signing in\u2026' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  );
}
