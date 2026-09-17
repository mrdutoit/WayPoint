import { colors, type } from '../../styles/tokens.js';

// A compact metric: icon + number + label, meant to sit inline inside a
// shared container rather than as its own bordered/shadowed box — three
// or four of these boxed identically was the generic "SaaS-card kit"
// tell (same radius, same shadow, no hierarchy). See Dashboard.jsx.
export default function StatCard({ icon: Icon, label, value, accent = colors.ink900 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {Icon && (
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: accent, background: `color-mix(in srgb, ${accent} 14%, transparent)`,
        }}>
          <Icon size={18} />
        </div>
      )}
      <div>
        <div style={{ fontSize: 21, fontWeight: 700, color: colors.ink900, lineHeight: 1.15, ...type.numeric }}>{value}</div>
        <div style={{ fontSize: 13, color: colors.ink500 }}>{label}</div>
      </div>
    </div>
  );
}
