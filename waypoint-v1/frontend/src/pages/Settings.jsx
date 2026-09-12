import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { meApi } from '../services/api.js';
import { Avatar } from '../components/Avatar.jsx';
import { AVATAR_OPTIONS, avatarValue } from '../constants/avatarOptions.js';
import { s, colors } from '../styles/tokens.js';

const SECTION_TITLE = { fontSize: 16, fontWeight: 700, marginBottom: 4, color: colors.ink900 };
const SECTION_NOTE = { fontSize: 13, color: colors.ink500, marginBottom: 16 };

// A representative set, matching profileService.js's TIMEZONE_IDS —
// keep these two lists in sync.
const TIMEZONES = [
  { id: 'Africa/Johannesburg', label: 'Johannesburg (SAST)' },
  { id: 'Europe/London', label: 'London' },
  { id: 'Europe/Berlin', label: 'Berlin' },
  { id: 'America/New_York', label: 'New York' },
  { id: 'America/Los_Angeles', label: 'Los Angeles' },
  { id: 'Asia/Dubai', label: 'Dubai' },
  { id: 'Asia/Singapore', label: 'Singapore' },
  { id: 'Australia/Sydney', label: 'Sydney' },
  { id: 'UTC', label: 'UTC' },
];

export default function Settings() {
  const { user, setUser } = useRole();
  const { isMobile } = useWindowSize();

  return (
    <div style={isMobile ? s.pageMobile : s.page}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: colors.ink900 }}>Settings</h1>
      <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 24 }}>
        Personal preferences — visible only to you.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 480 }}>
        <ThemeSection />
        <DateTimeSection user={user} setUser={setUser} />
        <ProfileSection user={user} />
        <SecuritySection />
        <AvatarSection user={user} setUser={setUser} />
      </div>
    </div>
  );
}

function ThemeSection() {
  const { theme, setTheme, themes } = useTheme();

  return (
    <div style={s.card}>
      <div style={SECTION_TITLE}>Theme</div>
      <div style={SECTION_NOTE}>Applies immediately, saved automatically.</div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {themes.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              padding: 12, borderRadius: 12, cursor: 'pointer', width: 100,
              border: theme === t.id ? `2px solid ${colors.brand600}` : `1px solid ${colors.line}`,
              background: colors.panel,
            }}
          >
            <div style={{
              width: '100%', height: 40, borderRadius: 8,
              background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})`,
            }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.ink900 }}>{t.name}{theme === t.id ? ' ✓' : ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// A stored preference only, not yet an app-wide "convert every
// timestamp" layer — see profileService.js's module comment for why
// that's separate, larger scope than this field.
function DateTimeSection({ user, setUser }) {
  const [timezone, setTimezone] = useState(user?.timezone ?? 'Africa/Johannesburg');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  async function handleChange(e) {
    const next = e.target.value;
    setTimezone(next);
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await meApi.update({ timezone: next });
      setUser((prev) => ({ ...prev, ...result.profile }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message ?? 'Failed to save timezone');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.card}>
      <div style={SECTION_TITLE}>Date &amp; Time</div>
      <div style={SECTION_NOTE}>The timezone dates are shown in. Applies immediately, saved automatically.</div>

      <select style={{ ...s.select, maxWidth: 300 }} value={timezone} onChange={handleChange} disabled={saving}>
        {TIMEZONES.map((tz) => <option key={tz.id} value={tz.id}>{tz.label}</option>)}
      </select>
      {saved && <span style={{ ...s.chip(colors.success, colors.successBg), marginLeft: 10 }}>Saved</span>}
      {error && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginTop: 12 }}>{error}</div>}
    </div>
  );
}

function ProfileSection({ user }) {
  return (
    <div style={s.card}>
      <div style={SECTION_TITLE}>Profile</div>
      <div style={SECTION_NOTE}>Set when your account was created.</div>

      <div style={{ marginBottom: 12 }}>
        <label style={s.label}>Name</label>
        <input disabled style={{ ...s.formInput, opacity: 0.6 }} value={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={s.label}>Email</label>
        <input disabled style={{ ...s.formInput, opacity: 0.6 }} value={user?.email ?? ''} />
      </div>
      <div>
        <label style={s.label}>Role</label>
        <div><span style={s.chip(colors.brand600, colors.ink100)}>{user?.role}</span></div>
      </div>
    </div>
  );
}

function SecuritySection() {
  const navigate = useNavigate();
  return (
    <div style={s.card}>
      <div style={SECTION_TITLE}>Security</div>
      <div style={SECTION_NOTE}>Change your password. You'll need your current password to do this.</div>
      <button type="button" onClick={() => navigate('/change-password')} style={s.btnSecondary}>
        Change password
      </button>
    </div>
  );
}

function AvatarSection({ user, setUser }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const current = user?.avatarOption ?? 'grad';

  async function handlePick(id) {
    if (id === current) return;
    setSaving(true);
    setError(null);
    try {
      const result = await meApi.update({ avatarOption: id });
      setUser((prev) => ({ ...prev, ...result.profile }));
    } catch (err) {
      setError(err.message ?? 'Failed to update avatar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.card}>
      <div style={SECTION_TITLE}>Avatar</div>
      <div style={SECTION_NOTE}>A colour for your initials bubble, shown in the nav bar. Applies immediately, saved automatically.</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Avatar firstName={user?.firstName} lastName={user?.lastName} avatarOption={current} size={56} />
        <div style={{ fontSize: 13, color: colors.ink500 }}>
          {user?.firstName} {user?.lastName}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {AVATAR_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            aria-label={`Choose ${opt.id} avatar colour`}
            onClick={() => handlePick(opt.id)}
            disabled={saving}
            style={{
              width: 40, height: 40, borderRadius: '50%', cursor: 'pointer',
              background: avatarValue(opt.id),
              border: current === opt.id ? `3px solid ${colors.brand600}` : '3px solid transparent',
              padding: 0,
            }}
          />
        ))}
      </div>
      {error && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginTop: 12 }}>{error}</div>}
    </div>
  );
}
