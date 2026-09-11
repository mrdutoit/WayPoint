import { useEffect, useState } from 'react';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { tenantsApi } from '../services/api.js';
import { s, colors } from '../styles/tokens.js';

const COMPLEXITY_HINTS = [
  { test: (v) => v.length >= 12, label: '12+ characters' },
  { test: (v) => /[a-z]/.test(v), label: 'lowercase' },
  { test: (v) => /[A-Z]/.test(v), label: 'uppercase' },
  { test: (v) => /[0-9]/.test(v), label: 'digit' },
  { test: (v) => /[^A-Za-z0-9]/.test(v), label: 'symbol' },
];

export default function TenantsAdmin() {
  const { isMobile } = useWindowSize();
  const [tenants, setTenants] = useState(null);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  function load() {
    return tenantsApi.list()
      .then((result) => setTenants(result?.tenants ?? []))
      .catch((err) => setError(err.message ?? 'Failed to load tenants'));
  }
  useEffect(() => { load(); }, []);

  return (
    <div style={isMobile ? s.pageMobile : s.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.ink900 }}>Tenants</h1>
        <button type="button" onClick={() => setShowCreate((v) => !v)} style={s.btnPrimary}>
          {showCreate ? 'Cancel' : 'New Tenant'}
        </button>
      </div>
      <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 20 }}>
        Creates the tenant and its first Tenant Administrator together (FR-011). The password you set here
        is a one-time bootstrap — the new admin is forced to change it at first login.
      </p>

      {showCreate && <CreateTenantForm onCreated={() => { setShowCreate(false); load(); }} />}

      {error && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginBottom: 16 }}>{error}</div>}
      {tenants === null && !error && <div style={{ fontSize: 13, color: colors.ink500 }}>Loading…</div>}
      {tenants && tenants.length === 0 && <div style={{ fontSize: 13, color: colors.ink500 }}>No tenants yet.</div>}

      {tenants && tenants.length > 0 && (
        <div style={s.tableCard}>
          <table style={{ ...s.table, minWidth: 420 }}>
            <thead>
              <tr>
                <th style={s.th}>Name</th>
                <th style={s.th}>Region</th>
                <th style={s.th}>Cascade levels</th>
                <th style={s.th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td style={s.td}>{t.name}</td>
                  <td style={s.td}>{t.region}</td>
                  <td style={s.td}>{t.cascadeLevelCount}</td>
                  <td style={s.td}>{new Date(t.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateTenantForm({ onCreated }) {
  const [name, setName] = useState('');
  const [region, setRegion] = useState('europe');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const hintsMet = COMPLEXITY_HINTS.map((h) => h.test(adminPassword));

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await tenantsApi.create({ name, region, adminEmail, adminFirstName, adminLastName, adminPassword });
      onCreated();
    } catch (err) {
      setError(err.message ?? 'Failed to create tenant');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...s.card, marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: colors.ink900 }}>Tenant</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={s.label}>Organisation name</label>
          <input required style={s.formInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Holdings" />
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <label style={s.label}>Region</label>
          <input style={s.formInput} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="europe" />
        </div>
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: colors.ink900 }}>First Tenant Administrator</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: '1 1 160px' }}>
          <label style={s.label}>First name</label>
          <input required style={s.formInput} value={adminFirstName} onChange={(e) => setAdminFirstName(e.target.value)} />
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <label style={s.label}>Last name</label>
          <input required style={s.formInput} value={adminLastName} onChange={(e) => setAdminLastName(e.target.value)} />
        </div>
      </div>
      <label style={s.label}>Email</label>
      <input required type="email" style={{ ...s.formInput, marginBottom: 14 }} value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />

      <label style={s.label}>Temporary password</label>
      <input
        required type="password" autoComplete="new-password" style={{ ...s.formInput, marginBottom: 6 }}
        value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)}
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
        {submitting ? 'Creating…' : 'Create Tenant'}
      </button>
    </form>
  );
}
