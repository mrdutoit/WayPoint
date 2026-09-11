import { useEffect, useMemo, useState } from 'react';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { usersApi } from '../services/api.js';
import { s, colors } from '../styles/tokens.js';

const COMPLEXITY_HINTS = [
  { test: (v) => v.length >= 12, label: '12+ characters' },
  { test: (v) => /[a-z]/.test(v), label: 'lowercase' },
  { test: (v) => /[A-Z]/.test(v), label: 'uppercase' },
  { test: (v) => /[0-9]/.test(v), label: 'digit' },
  { test: (v) => /[^A-Za-z0-9]/.test(v), label: 'symbol' },
];
const ASSIGNABLE_ROLES = ['Manager', 'Employee'];

export default function UsersAdmin() {
  const { isMobile } = useWindowSize();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [showInvite, setShowInvite] = useState(false);

  function load() {
    return usersApi.list()
      .then((result) => setUsers(result?.users ?? []))
      .catch((err) => setError(err.message ?? 'Failed to load users'));
  }
  useEffect(() => { load(); }, []);

  const nameById = useMemo(() => {
    const map = {};
    for (const u of users ?? []) map[u.id] = `${u.firstName} ${u.lastName}`;
    return map;
  }, [users]);

  return (
    <div style={isMobile ? s.pageMobile : s.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.ink900 }}>Users</h1>
        <button type="button" onClick={() => setShowInvite((v) => !v)} style={s.btnPrimary}>
          {showInvite ? 'Cancel' : 'Invite user'}
        </button>
      </div>
      <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 20 }}>
        Managers and Employees in your organisation. The password you set here is a one-time bootstrap —
        each new user is forced to change it at first login.
      </p>

      {showInvite && (
        <InviteUserForm managers={(users ?? []).filter((u) => u.role === 'Manager')} onCreated={() => { setShowInvite(false); load(); }} />
      )}

      {error && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginBottom: 16 }}>{error}</div>}
      {users === null && !error && <div style={{ fontSize: 13, color: colors.ink500 }}>Loading…</div>}
      {users && users.length === 0 && <div style={{ fontSize: 13, color: colors.ink500 }}>No users yet — invite the first one above.</div>}

      {users && users.length > 0 && (
        <div style={s.tableCard}>
          <table style={{ ...s.table, minWidth: 560 }}>
            <thead>
              <tr>
                <th style={s.th}>Name</th>
                <th style={s.th}>Email</th>
                <th style={s.th}>Role</th>
                <th style={s.th}>Manager</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow key={u.id} user={u} managerName={u.managerId ? nameById[u.managerId] : null} onChanged={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UserRow({ user, managerName, onChanged }) {
  const isTenantAdmin = user.role === 'TenantAdmin';
  const [roleSaving, setRoleSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [rowError, setRowError] = useState(null);

  async function handleRoleChange(e) {
    const newRole = e.target.value;
    if (newRole === user.role) return;
    setRoleSaving(true);
    setRowError(null);
    try {
      await usersApi.updateRole(user.id, newRole);
      onChanged();
    } catch (err) {
      setRowError(err.message ?? 'Failed to change role');
    } finally {
      setRoleSaving(false);
    }
  }

  async function handleForceReset() {
    setResetSaving(true);
    setRowError(null);
    try {
      await usersApi.forcePasswordReset(user.id, resetPassword);
      setResetOpen(false);
      setResetPassword('');
    } catch (err) {
      setRowError(err.message ?? 'Failed to reset password');
    } finally {
      setResetSaving(false);
    }
  }

  return (
    <>
      <tr>
        <td style={s.td}>{user.firstName} {user.lastName}</td>
        <td style={s.td}>{user.email}</td>
        <td style={s.td}>
          {isTenantAdmin ? (
            <span style={s.chip(colors.brand600, colors.ink100)}>TenantAdmin</span>
          ) : (
            <select value={user.role} onChange={handleRoleChange} disabled={roleSaving} style={{ ...s.select, width: 130 }}>
              {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
        </td>
        <td style={s.td}>{managerName ?? '—'}</td>
        <td style={s.td}>
          {!isTenantAdmin && (
            <button type="button" onClick={() => setResetOpen((v) => !v)} style={{ ...s.btnSecondary, padding: '6px 10px', fontSize: 12 }}>
              {resetOpen ? 'Cancel' : 'Reset password'}
            </button>
          )}
        </td>
      </tr>
      {resetOpen && (
        <tr>
          <td colSpan={5} style={{ ...s.td, background: colors.ink50 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="password" autoComplete="new-password" placeholder="New temporary password"
                style={{ ...s.formInput, maxWidth: 240 }} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)}
              />
              <button type="button" onClick={handleForceReset} disabled={resetSaving || !resetPassword} style={s.btnPrimary}>
                {resetSaving ? 'Resetting…' : 'Set password'}
              </button>
              <span style={{ fontSize: 12, color: colors.ink500 }}>Forces a change at their next login.</span>
            </div>
          </td>
        </tr>
      )}
      {rowError && (
        <tr>
          <td colSpan={5} style={s.td}>
            <div style={s.chip(colors.danger, colors.dangerBg)}>{rowError}</div>
          </td>
        </tr>
      )}
    </>
  );
}

function InviteUserForm({ managers, onCreated }) {
  const [role, setRole] = useState('Employee');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [managerId, setManagerId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const hintsMet = COMPLEXITY_HINTS.map((h) => h.test(password));

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await usersApi.invite({ role, email, firstName, lastName, password, managerId: managerId || undefined });
      onCreated();
    } catch (err) {
      setError(err.message ?? 'Failed to invite user');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...s.card, marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: '1 1 160px' }}>
          <label style={s.label}>Role</label>
          <select style={s.select} value={role} onChange={(e) => setRole(e.target.value)}>
            {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {managers.length > 0 && (
          <div style={{ flex: '1 1 200px' }}>
            <label style={s.label}>Manager (optional)</label>
            <select style={s.select} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">No manager</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: '1 1 160px' }}>
          <label style={s.label}>First name</label>
          <input required style={s.formInput} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <label style={s.label}>Last name</label>
          <input required style={s.formInput} value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>

      <label style={s.label}>Email</label>
      <input required type="email" style={{ ...s.formInput, marginBottom: 14 }} value={email} onChange={(e) => setEmail(e.target.value)} />

      <label style={s.label}>Temporary password</label>
      <input
        required type="password" autoComplete="new-password" style={{ ...s.formInput, marginBottom: 6 }}
        value={password} onChange={(e) => setPassword(e.target.value)}
      />
      <div style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {COMPLEXITY_HINTS.map((h, i) => (
          <span key={h.label} style={{ fontSize: 11, color: hintsMet[i] ? colors.success : colors.ink500 }}>
            {hintsMet[i] ? '✓' : '○'} {h.label}
          </span>
        ))}
      </div>

      {error && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginBottom: 14 }}>{error}</div>}

      <button type="submit" disabled={submitting} style={s.btnPrimary}>
        {submitting ? 'Inviting…' : 'Invite user'}
      </button>
    </form>
  );
}
