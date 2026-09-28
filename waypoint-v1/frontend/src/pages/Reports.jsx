import { Link } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import { useTerms } from '../context/TerminologyContext.jsx';
import './dashboard.css';
import './reports.css';

/*
 * Reports hub — 2026-09-24 redesign. Each report gets a small drawing in
 * its own visual language on the signature panel (the course line, the
 * lanes, the cascade, the cadence strip), so the hub previews what each
 * report looks like rather than listing four identical text cards.
 * Static SVG: no data is fetched here.
 */

// Theme tokens only (2026-09-27): the preview panels follow the active
// theme like every other signature panel. Dots use the status colours the
// real charts use; the journey line uses the --path-* gradient. Colours go
// in `style` (where var() resolves) rather than presentation attributes.
const C = {
  onTrack: 'var(--brand600)', achieved: 'var(--success)', atRisk: 'var(--warn)', offTrack: 'var(--danger)',
  pathA: 'var(--path-a)', pathB: 'var(--path-b)', pathC: 'var(--path-c)',
  solid: 'var(--hero-solid)', card: 'var(--hero-card)', strong: 'var(--hero-strong)',
  faint: 'color-mix(in srgb, var(--hero-ink) 45%, transparent)',
  line: 'color-mix(in srgb, var(--hero-ink) 25%, transparent)',
  cell: 'color-mix(in srgb, var(--hero-ink) 14%, transparent)',
  text: 'color-mix(in srgb, var(--hero-ink) 55%, transparent)',
};

function PathGradient({ id, x1, x2 }) {
  return (
    <defs>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} x2={x2} y1="0" y2="0">
        <stop offset="0" style={{ stopColor: C.pathA }} />
        <stop offset="0.5" style={{ stopColor: C.pathB }} />
        <stop offset="1" style={{ stopColor: C.pathC }} />
      </linearGradient>
    </defs>
  );
}

function ArtCourse() {
  const dots = [[40, C.atRisk], [95, C.atRisk], [150, C.onTrack], [205, C.onTrack], [250, C.offTrack], [300, C.onTrack], [345, C.achieved]];
  return (
    <svg viewBox="0 0 420 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <PathGradient id="hub-g" x1="20" x2="400" />
      <path d="M20,86 L95,70 L150,70 L205,72 L250,82 L300,58 L345,52" fill="none" style={{ stroke: C.pathA }} strokeOpacity="0.6" strokeWidth="1.5" />
      <path d="M20,86 L95,70 L150,70 L205,72 L250,82 L300,58 L345,52 L345,100 L20,100 Z" style={{ fill: C.pathA }} fillOpacity="0.08" />
      <line x1="20" x2="360" y1="110" y2="110" stroke="url(#hub-g)" strokeWidth="3" strokeLinecap="round" />
      <line x1="360" x2="400" y1="110" y2="110" style={{ stroke: C.faint }} strokeWidth="2" strokeDasharray="2 6" />
      <line x1="360" x2="360" y1="40" y2="118" style={{ stroke: C.strong }} strokeOpacity="0.7" />
      {dots.map(([x, c], i) => <circle key={i} cx={x} cy="110" r="5" style={{ fill: c, stroke: C.solid }} strokeWidth="2" />)}
    </svg>
  );
}

function ArtLanes() {
  const lanes = [[[60, C.onTrack], [150, C.onTrack], [260, C.achieved]], [[90, C.atRisk], [200, C.offTrack]], [[130, C.onTrack], [230, C.onTrack], [300, C.onTrack]]];
  return (
    <svg viewBox="0 0 420 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <PathGradient id="hub-g2" x1="50" x2="400" />
      {lanes.map((dots, i) => {
        const y = 40 + i * 36;
        return (
          <g key={i}>
            <circle cx="28" cy={y} r="9" style={{ fill: C.onTrack }} fillOpacity="0.7" />
            <line x1="50" x2="330" y1={y} y2={y} stroke="url(#hub-g2)" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="330" x2="400" y1={y} y2={y} style={{ stroke: C.faint }} strokeWidth="1.5" strokeDasharray="2 5" />
            {dots.map(([x, c], j) => <circle key={j} cx={x} cy={y} r="4.5" style={{ fill: c, stroke: C.solid }} strokeWidth="2" />)}
          </g>
        );
      })}
      <line x1="330" x2="330" y1="20" y2="130" style={{ stroke: C.strong }} strokeOpacity="0.6" />
    </svg>
  );
}

function ArtCascade() {
  const card = (x, y, c) => (
    <g>
      <rect x={x} y={y} width="78" height="26" rx="6" style={{ fill: C.card, stroke: C.line }} />
      <rect x={x} y={y} width="3" height="26" rx="1.5" style={{ fill: c }} />
      <rect x={x + 10} y={y + 10} width="44" height="5" rx="2.5" style={{ fill: C.text }} />
    </g>
  );
  const edge = (x1, y1, x2, y2, c) => <path d={`M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`} fill="none" style={{ stroke: c }} strokeOpacity="0.7" strokeWidth="1.5" />;
  return (
    <svg viewBox="0 0 420 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {edge(98, 75, 150, 42, C.onTrack)}{edge(98, 75, 150, 108, C.atRisk)}
      {edge(228, 42, 280, 24, C.achieved)}{edge(228, 42, 280, 62, C.onTrack)}{edge(228, 108, 280, 108, C.offTrack)}
      {card(20, 62, C.onTrack)}{card(150, 29, C.onTrack)}{card(150, 95, C.atRisk)}
      {card(280, 11, C.achieved)}{card(280, 49, C.onTrack)}{card(280, 95, C.offTrack)}
    </svg>
  );
}

function ArtCadence() {
  const rows = [
    '0010100100010001000100001010010',
    '0000000000100000000000100000000',
    '1011010110101101011010110110101',
  ];
  return (
    <svg viewBox="0 0 420 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {rows.map((r, i) => r.split('').map((v, j) => (
        <rect key={`${i}-${j}`} x={30 + j * 12} y={36 + i * 30} width="10" height="18" rx="2"
          style={{ fill: v === '1' ? C.onTrack : C.cell }} fillOpacity={v === '1' && j % 5 !== 0 ? 0.6 : 1} />
      )))}
    </svg>
  );
}

export default function Reports() {
  const { user, isManager, isTenantAdmin } = useRole();
  const { t, tPlural } = useTerms();
  const reports = [
    { to: `/reports/scorecard/${user?.id}`, art: <ArtCourse />, title: 'My scorecard', desc: `Your ${tPlural('Objective').toLowerCase()} and ${tPlural('KeyResult').toLowerCase()} this ${t('Cycle').toLowerCase()}: what each contributes, how confidence has moved, every ${t('CheckIn').toLowerCase()}.`, who: 'Everyone' },
    isManager && { to: '/reports/team-progress', art: <ArtLanes />, title: 'Team progress', desc: `Each direct report's passage through the ${t('Cycle').toLowerCase()}, their check-in rhythm, and the riskiest ${tPlural('KeyResult').toLowerCase()} first.`, who: 'Managers' },
    { to: '/reports/alignment-map', art: <ArtCascade />, title: 'Alignment map', desc: `The whole cascade as a map: how every ${t('Objective').toLowerCase()} connects to the ones above it, and which ones don't.`, who: 'Everyone' },
    isTenantAdmin && { to: '/reports/checkin-compliance', art: <ArtCadence />, title: 'Check-in compliance', desc: `Who is keeping their ${tPlural('KeyResult').toLowerCase()} current, day by day, and who has gone quiet.`, who: 'Tenant administrators' },
  ].filter(Boolean);

  return (
    <div className="db">
      <div className="rp-head">
        <div>
          <h1 className="rp-title">Reports</h1>
          <p className="rp-sub">Computed live against the current {t('Cycle').toLowerCase()}. What you see depends on your role.</p>
        </div>
      </div>
      <div className="rp-hub">
        {reports.map((r) => (
          <Link key={r.title} to={r.to} className="rp-card">
            <div className="rp-card-art">{r.art}</div>
            <div className="rp-card-body">
              <h2 className="rp-card-title">{r.title}</h2>
              <p className="rp-card-desc">{r.desc}</p>
              <span className="rp-card-who">For {r.who.toLowerCase()}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
