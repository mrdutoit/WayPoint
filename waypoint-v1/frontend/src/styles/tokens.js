// Named exports only — no default export.

// Every value here is a CSS var() reference, not a literal hex code —
// the actual values live in themes.css's [data-theme="..."] blocks.
// This is what makes every existing page/component theme-aware for
// free: they already import `colors` from here and never touch a hex
// value directly, so switching ThemeContext's active theme reskins the
// whole app without any component file changing.
export const colors = {
  brand50: 'var(--brand50)', brand100: 'var(--brand100)', brand500: 'var(--brand500)',
  brand600: 'var(--brand600)', brand700: 'var(--brand700)',
  ink50: 'var(--ink50)', ink100: 'var(--ink100)', ink200: 'var(--ink200)', ink300: 'var(--ink300)',
  ink400: 'var(--ink400)', ink500: 'var(--ink500)', ink600: 'var(--ink600)', ink700: 'var(--ink700)',
  ink800: 'var(--ink800)', ink900: 'var(--ink900)',
  success: 'var(--success)', successBg: 'var(--success-bg)',
  warn: 'var(--warn)', warnBg: 'var(--warn-bg)',
  danger: 'var(--danger)', dangerBg: 'var(--danger-bg)',
  panel: 'var(--panel)', line: 'var(--line)',
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const shadow = {
  xs: '0 1px 2px rgba(15,23,42,0.04)',
  sm: '0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)',
  md: '0 4px 12px rgba(15,23,42,0.08)',
  lg: '0 12px 32px rgba(15,23,42,0.12)',
  focus: '0 0 0 3px rgba(46,140,240,0.30)',
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

export const CHART_PALETTE = {
  grid: colors.ink200,
  series: [colors.brand500, '#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#7c3aed'],
};

export const STATUS_META = {
  'Not Started': { color: colors.ink500, bg: colors.ink100 },
  'Off Track': { color: colors.danger, bg: colors.dangerBg },
  'At Risk': { color: colors.warn, bg: colors.warnBg },
  'On Track': { color: colors.brand600, bg: colors.brand50 },
  'Achieved': { color: colors.success, bg: colors.successBg },
};

// 2026-09-25: refreshed to the Dashboard/Reports design language so every
// page still built from these inline styles (Settings and admin pages)
// picks up the same look without a rewrite: quiet hairline panels instead
// of drop-shadowed cards, sentence-case table headers, pill buttons,
// softer 10px inputs (focus ring comes from index.css).
export const s = {
  page: { padding: '28px 32px 56px', maxWidth: 1200, margin: '0 auto' },
  pageMobile: { padding: '16px 16px 40px' },
  card: {
    background: colors.panel, border: `1px solid ${colors.line}`,
    borderRadius: 14, padding: '20px 22px',
  },
  tableCard: {
    background: colors.panel, border: `1px solid ${colors.line}`,
    borderRadius: 14, overflow: 'auto',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: '12px 20px', fontSize: 12.5, fontWeight: 600,
    color: colors.ink500, borderBottom: `1px solid ${colors.line}`, whiteSpace: 'nowrap',
    background: colors.ink50,
  },
  td: { padding: '14px 20px', fontSize: 14, color: colors.ink800, borderBottom: `1px solid ${colors.line}`, verticalAlign: 'middle' },
  chip: (color, bg) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '3px 10px', borderRadius: radius.pill,
    fontSize: 12, fontWeight: 600, color, background: bg,
  }),
  btnPrimary: {
    background: colors.brand600, color: '#fff', border: '1px solid transparent',
    borderRadius: radius.pill, padding: '8px 16px', fontSize: 13.5, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  btnSecondary: {
    background: 'transparent', color: colors.ink700, border: `1px solid ${colors.line}`,
    borderRadius: radius.pill, padding: '8px 16px', fontSize: 13.5, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  formInput: {
    color: colors.ink900, colorScheme: 'light dark',
    background: colors.panel, border: `1px solid ${colors.line}`,
    borderRadius: 10, padding: '10px 12px', fontSize: 14,
    fontFamily: 'inherit', width: '100%',
  },
  select: {
    color: colors.ink900, colorScheme: 'light dark',
    background: colors.panel, border: `1px solid ${colors.line}`,
    borderRadius: 10, padding: '10px 12px', fontSize: 14,
    fontFamily: 'inherit', width: '100%',
  },
  label: { fontSize: 12.5, fontWeight: 600, color: colors.ink600, marginBottom: 6, display: 'block' },
  // Section headings inside settings/admin pages — the display face, as on the reports.
  sectionTitle: { fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 650, letterSpacing: '-0.01em', marginBottom: 4, color: colors.ink900 },
  navBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 24px', background: colors.panel, borderBottom: `1px solid ${colors.line}`,
  },
  sidebar: {
    width: 240, background: colors.panel, borderRight: `1px solid ${colors.line}`,
    padding: '20px 12px',
  },
};
