import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import { Logo } from '../components/Logo.jsx';
import { s, colors } from '../styles/tokens.js';
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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: colors.ink50 }}>
      <form onSubmit={handleSubmit} style={{ ...s.card, width: 380 }}>
        <div style={{ marginBottom: 20 }}>
          <Logo size={32} withWordmark />
        </div>
        <h1 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: colors.ink900 }}>
          {forced ? 'Set a new password' : 'Change password'}
        </h1>
        <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 20 }}>
          {forced
            ? 'For security, set your own password before continuing.'
            : 'Choose a new password for your account.'}
        </p>

        {success ? (
          <div style={s.chip(colors.success, colors.successBg)}>
            Password changed.{forced ? ' Taking you into WayPoint…' : ''}
          </div>
        ) : (
          <>
            <label style={s.label} htmlFor="cp-current">Current password</label>
            <input
              id="cp-current" type="password" required autoComplete="current-password" autoFocus
              style={{ ...s.formInput, marginBottom: 14 }}
              value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
            />

            <label style={s.label} htmlFor="cp-new">New password</label>
            <input
              id="cp-new" type="password" required autoComplete="new-password"
              style={{ ...s.formInput, marginBottom: 8 }}
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            />
            <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {COMPLEXITY_HINTS.map((h, i) => (
                <span key={h.label} style={{ fontSize: 12, color: hintsMet[i] ? colors.success : colors.ink500 }}>
                  {hintsMet[i] ? '✓' : '○'} {h.label}
                </span>
              ))}
            </div>

            <label style={s.label} htmlFor="cp-confirm">Confirm new password</label>
            <input
              id="cp-confirm" type="password" required autoComplete="new-password"
              style={{ ...s.formInput, marginBottom: 6 }}
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <div style={{ fontSize: 12, color: colors.danger, marginBottom: 8 }}>Passwords do not match</div>
            )}

            {error && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginTop: 8, marginBottom: 14 }}>{error}</div>}

            <button type="submit" disabled={!canSubmit || submitting} style={{ ...s.btnPrimary, width: '100%', marginTop: 6 }}>
              {submitting ? 'Changing…' : 'Change password'}
            </button>

            {!forced && (
              <button type="button" onClick={() => navigate('/')} style={{ ...s.btnSecondary, width: '100%', marginTop: 10 }}>
                Cancel
              </button>
            )}
            {forced && (
              <button
                type="button" onClick={handleLogoutInstead}
                style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', marginTop: 14, fontSize: 13, color: colors.ink500, fontFamily: 'inherit' }}
              >
                Log out instead
              </button>
            )}
          </>
        )}
      </form>
    </div>
  );
}
