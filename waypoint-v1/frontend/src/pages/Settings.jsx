import { useState } from 'react';
import { useRole } from '../context/RoleContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { meApi } from '../services/api.js';
import { Avatar } from '../components/Avatar.jsx';
import { AVATAR_OPTIONS, avatarValue } from '../constants/avatarOptions.js';
import { s, colors } from '../styles/tokens.js';

const SECTION_TITLE = { fontSize: 16, fontWeight: 700, marginBottom: 4, color: colors.ink900 };
const SECTION_NOTE = { fontSize: 13, color: colors.ink500, marginBottom: 16 };

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
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.ink900 }}>{t.name}</span>
          </button>
        ))}
      </div>
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
      <div style={SECTION_NOTE}>A colour for your initials bubble, shown in the nav bar.</div>

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
