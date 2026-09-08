// Named exports only — no default export. Every consumer imports as:
//   import { s, colors, STATUS_META } from '../styles/tokens.js';
// A default import will fail the Rollup/Vercel build.

export const colors = {
  // Brand
  brand50: '#eef2ff', brand100: '#e0e7ff', brand500: '#4f46e5', brand600: '#4338ca', brand700: '#3730a3',
  // Slate neutral ramp — reads more current than plain grey
  ink50: '#f8fafc', ink100: '#f1f5f9', ink200: '#e2e8f0', ink300: '#cbd5e1',
  ink400: '#94a3b8', ink500: '#64748b', ink600: '#475569', ink700: '#334155', ink800: '#1e293b', ink900: '#0f172a',
  // Semantic
  success: '#16a34a', successBg: '#f0fdf4',
  warn: '#d97706', warnBg: '#fffbeb',
  danger: '#dc2626', dangerBg: '#fef2f2',
  panel: '#ffffff', line: '#e2e8f0',
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const shadow = {
  xs: '0 1px 2px rgba(15,23,42,0.04)',
  sm: '0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)',
  md: '0 4px 12px rgba(15,23,42,0.08)',
  lg: '0 12px 32px rgba(15,23,42,0.12)',
  focus: '0 0 0 3px rgba(79,70,229,0.30)',
};

export const type = {
  xs: { fontSize: 12, lineHeight: '16px' },
  sm: { fontSize: 13, lineHeight: '18px' },
  base: { fontSize: 14, lineHeight: '20px' },
  md: { fontSize: 16, lineHeight: '24px' },
  lg: { fontSize: 20, lineHeight: '28px', fontWeight: 600 },
  xl: { fontSize: 28, lineHeight: '36px', fontWeight: 700 },
  numeric: { fontVariantNumeric: 'tabular-nums' },
};

// Categorical chart palette — see rubric levels / confidence indicators.
export const CHART_PALETTE = {
  grid: colors.ink200,
  series: [colors.brand500, '#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#7c3aed'],
};

// Rubric-level visual meaning — matches the configurable scoring rubric
// (Requirements document, section 3.5). Falls back to a neutral chip for
// any custom label a tenant defines beyond the default four.
export const STATUS_META = {
  'Not Started': { color: colors.ink500, bg: colors.ink100 },
  'Off Track': { color: colors.danger, bg: colors.dangerBg },
  'At Risk': { color: colors.warn, bg: colors.warnBg },
  'On Track': { color: colors.brand600, bg: colors.brand50 },
  'Achieved': { color: colors.success, bg: colors.successBg },
};

// The shared style-object map. Every page/component reads from `s` rather
// than inventing inline styles ad hoc, so a single edit here re-themes the
// whole app. Only keys that exist here may be referenced — see the
// app-builder scaffold rule: never invent a token key.
export const s = {
  page: { padding: '24px 32px', maxWidth: 1200, margin: '0 auto' },
  pageMobile: { padding: '16px' },

  card: {
    background: colors.panel, border: `1px solid ${colors.line}`,
    borderRadius: radius.md, boxShadow: shadow.sm, padding: 20,
  },
  // CRITICAL: 'auto', never 'hidden' — 'hidden' cancels horizontal scroll
  // on narrow viewports and makes row action buttons unreachable.
  tableCard: {
    background: colors.panel, border: `1px solid ${colors.line}`,
    borderRadius: radius.md, boxShadow: shadow.sm, overflow: 'auto',
  },

  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: '10px 16px', fontSize: 12, fontWeight: 600,
    color: colors.ink500, textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: `1px solid ${colors.line}`, whiteSpace: 'nowrap',
  },
  td: { padding: '12px 16px', fontSize: 14, color: colors.ink800, borderBottom: `1px solid ${colors.ink100}` },

  chip: (color, bg) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '3px 10px', borderRadius: radius.pill,
    fontSize: 12, fontWeight: 600, color, background: bg,
  }),

  btnPrimary: {
    background: colors.brand600, color: '#fff', border: 'none',
    borderRadius: radius.sm, padding: '10px 18px', fontSize: 14, fontWeight: 600,
    cursor: 'pointer',
  },
  btnSecondary: {
    background: colors.panel, color: colors.ink700, border: `1px solid ${colors.line}`,
    borderRadius: radius.sm, padding: '10px 18px', fontSize: 14, fontWeight: 600,
    cursor: 'pointer',
  },

  formInput: {
    color: colors.ink900, colorScheme: 'light dark',
    background: colors.panel, border: `1px solid ${colors.line}`,
    borderRadius: radius.sm, padding: '9px 12px', fontSize: 14,
    fontFamily: 'inherit', width: '100%',
  },
  // Native <select> needs both color and colorScheme set explicitly —
  // browsers apply OS defaults otherwise, regardless of surrounding theme.
  select: {
    color: colors.ink900, colorScheme: 'light dark',
    background: colors.panel, border: `1px solid ${colors.line}`,
    borderRadius: radius.sm, padding: '9px 12px', fontSize: 14,
    fontFamily: 'inherit', width: '100%',
  },
  label: { fontSize: 13, fontWeight: 600, color: colors.ink700, marginBottom: 6, display: 'block' },

  navBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 24px', background: colors.panel, borderBottom: `1px solid ${colors.line}`,
  },
  sidebar: {
    width: 240, background: colors.panel, borderRight: `1px solid ${colors.line}`,
    padding: '20px 12px',
  },
};
