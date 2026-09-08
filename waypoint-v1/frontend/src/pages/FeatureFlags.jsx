import { useState } from 'react';
import { useFlags } from '../context/FlagContext.jsx';
import { useRole } from '../context/RoleContext.jsx';
import { flagsApi } from '../services/api.js';
import { s, colors } from '../styles/tokens.js';

const FLAG_DEFINITIONS = [
  { key: 'billing.mode', label: 'Billing mode', valueType: 'enum', options: ['manual', 'gateway'], note: 'FR-021' },
  { key: 'auth.sso.enabled', label: 'Single sign-on', valueType: 'boolean', note: 'FR-029' },
  { key: 'security.fieldEncryption.enabled', label: 'Field-level encryption', valueType: 'boolean', note: 'FR-028' },
  { key: 'ai.settingsMenu.enabled', label: 'AI Settings menu', valueType: 'boolean', note: 'FR-022 \u2014 scaffolded, not yet active' },
];

export default function FeatureFlags() {
  const { isPlatformAdmin } = useRole();
  const { flags, flag } = useFlags();
  const [saving, setSaving] = useState(null);

  if (!isPlatformAdmin) {
    return (
      <div style={s.page}>
        <p style={{ color: colors.ink500 }}>This page is only available to Platform Administrators.</p>
      </div>
    );
  }

  async function handleToggle(def) {
    setSaving(def.key);
    const next = !flag(def.key);
    try {
      await flagsApi.update(def.key, next, def.valueType, null);
    } finally {
      setSaving(null);
    }
  }

  async function handleEnumChange(def, value) {
    setSaving(def.key);
    try {
      await flagsApi.update(def.key, value, def.valueType, null);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={s.page}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: colors.ink900 }}>Feature Flags</h1>
      <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 20 }}>
        Platform-wide defaults. A tenant-specific override is set from that tenant's settings once tenant
        provisioning is built (Stage 4).
      </p>

      <div style={s.tableCard}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Flag</th>
              <th style={s.th}>Value</th>
              <th style={s.th}>Reference</th>
            </tr>
          </thead>
          <tbody>
            {FLAG_DEFINITIONS.map((def) => (
              <tr key={def.key}>
                <td style={s.td}>{def.label}</td>
                <td style={s.td}>
                  {def.valueType === 'boolean' ? (
                    <button
                      onClick={() => handleToggle(def)}
                      disabled={saving === def.key}
                      style={flags[def.key] ? { ...s.chip(colors.success, colors.successBg), border: 'none', cursor: 'pointer' }
                                            : { ...s.chip(colors.ink500, colors.ink100), border: 'none', cursor: 'pointer' }}
                    >
                      {flags[def.key] ? 'On' : 'Off'}
                    </button>
                  ) : (
                    <select
                      value={flags[def.key] ?? def.options[0]}
                      onChange={(e) => handleEnumChange(def, e.target.value)}
                      disabled={saving === def.key}
                      style={{ ...s.select, width: 160 }}
                    >
                      {def.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  )}
                </td>
                <td style={{ ...s.td, color: colors.ink500, fontSize: 12 }}>{def.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
