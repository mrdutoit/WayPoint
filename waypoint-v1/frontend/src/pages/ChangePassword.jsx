import { useState } from 'react';
import '../components/auth.css';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import { s } from '../styles/tokens.js';
import './dashboard.css';
import './reports.css';
import { authApi, setAuthToken, clearAuthToken } from '../services/api.js';

/**
 * Two entry points, one component — same as MedBroker's ChangePassword.jsx:
 *   - forced={true}: rendered by App.jsx's RequireAuth when
 *     user.passwordMustChange is true (an admin-set password — first
 *     login after being invited, or after a force-reset). Blocks the
 *     rest of the app; no cancel, since there's nowhere to cancel back to.
 *   - forced={false} (default): the voluntary /change-password route,
 *     reached from the "Change password" link in the nav.
 * Same backend endpoint either way (PUT /api/auth/change-password) —
 * see that handler's comment in auth-router.js for why currentPassword
 * is required even on the forced path (the user just used it to log in,
 * so they still know it).
 */

const COMPLEXITY_HINTS = [
  { test: (v) => v.length >= 12, label: 'At least 12 characters' },
  { test: (v) => /[a-z]/.test(v), label: 'A lowercase letter' },
  { test: (v) => /[A-Z]/.test(v), label: 'An uppercase letter' },
  { test: (v) => /[0-9]/.test(v), label: 'A digit' },
  { test: (v) => /[^A-Za-z0-9]/.test(v), label: 'A symbol' },
];

export default function ChangePassword({ forced = false }) {
  const { user, setUser } = useRole();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const hintsMet = COMPLEXITY_HINTS.map((h) => h.test(newPassword));
  const allHintsMet = hintsMet.every(Boolean);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = currentPassword.length > 0 && allHintsMet && passwordsMatch;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await authApi.changePassword(currentPassword, newPassword);
      setAuthToken(result.token);
      // Flips user.passwordMustChange false — App.jsx's RequireAuth
      // re-renders into the app automatically once this happens, no
      // navigation needed on the forced path.
      setUser({ ...user, passwordMustChange: false });
      setSuccess(true);
      if (!forced) setTimeout(() => navigate('/'), 1200);
    } catch (err) {
      setError(err.message ?? 'Could not change password');
    } finally {
      setSubmitting(false);
    }
  }

  function handleLogoutInstead() {
    clearAuthToken();
    setUser(null);
  }

  const form = success ? (
    <div className="auth-ok">Password changed.{forced ? ' Taking you into WayPoint…' : ' Taking you back to your dashboard…'}</div>
  ) : (
    <form onSubmit={handleSubmit} className="auth-form">
      <label>
        Current password
        <input type="password" required autoComplete="current-password" autoFocus style={s.formInput}
          value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
      </label>
      <label>
        New password
        <input type="password" required autoComplete="new-password" style={s.formInput}
          value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <span className="cp-hints">
          {COMPLEXITY_HINTS.map((h, i) => (
            <span key={h.label} className={hintsMet[i] ? 'met' : ''}>{h.label}</span>
          ))}
        </span>
      </label>
      <label>
        Confirm new password
        <input type="password" required autoComplete="new-password" style={s.formInput}
          value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        {confirmPassword.length > 0 && !passwordsMatch && <span className="auth-hint" style={{ color: 'var(--danger)' }}>Passwords don&apos;t match yet</span>}
      </label>
      {error && <div className="auth-error">{error}</div>}
      <button type="submit" disabled={!canSubmit || submitting} className="auth-submit">
        {submitting ? 'Changing…' : 'Change password'}
      </button>
      {!forced && <button type="button" onClick={() => navigate('/')} className="auth-link">Cancel</button>}
      {forced && <button type="button" onClick={handleLogoutInstead} className="auth-link">Sign out instead</button>}
    </form>
  );

  // Forced (first sign-in / admin reset): full sign-in layout, no app
  // around it. Voluntary: an ordinary page inside the app shell.
  if (forced) {
    return (
      <AuthLayout>
        <h1 className="auth-title">Set a new password</h1>
        <p className="auth-sub">For security, choose your own password before continuing.</p>
        {form}
      </AuthLayout>
    );
  }
  return (
    <div className="db">
      <div className="rp-head">
        <div>
          <h1 className="rp-title">Change password</h1>
          <p className="rp-sub">Choose a new password for your account. You&apos;ll stay signed in.</p>
        </div>
      </div>
      <div className="cp-panel">{form}</div>
    </div>
  );
}
