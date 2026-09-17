import { s, colors, type } from '../../styles/tokens.js';

export default function StatCard({ label, value, accent = colors.ink900, sublabel }) {
  return (
    <div style={{ ...s.card, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140, flex: '1 1 160px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: accent, ...type.numeric }}>
        {value}
      </div>
      {sublabel && <div style={{ fontSize: 12, color: colors.ink400 }}>{sublabel}</div>}
    </div>
  );
}
