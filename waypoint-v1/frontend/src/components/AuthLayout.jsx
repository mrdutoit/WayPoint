import { Logo } from './Logo.jsx';
import './auth.css';

/*
 * Sign-in and password screens (2026-09-25). Split layout: the signature
 * panel on the left (follows the active theme, 2026-09-27) — a Cycle drawn as a course with its
 * waypoints, the same motif as the Dashboard — and the form on the right.
 * On a phone the panel collapses to a slim band above the form.
 */
// Theme tokens only (2026-09-27) — the panel follows the active theme.
const DOTS = [[70, 'var(--warn)'], [150, 'var(--brand600)'], [215, 'var(--brand600)'], [300, 'var(--danger)'], [360, 'var(--brand600)'], [430, 'var(--success)']];
const FAINT = 'color-mix(in srgb, var(--hero-ink) 50%, transparent)';

export default function AuthLayout({ children }) {
  return (
    <div className="auth">
      <aside className="auth-art" aria-hidden="true">
        <div className="auth-art-copy">
          <p className="auth-kicker">Objectives and key results</p>
          <h2 className="auth-headline">Know where every objective stands, all the way up the cascade.</h2>
        </div>
        <svg className="auth-course" viewBox="0 0 520 170" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="auth-g" gradientUnits="userSpaceOnUse" x1="30" x2="460" y1="0" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--path-a)' }} />
              <stop offset="0.5" style={{ stopColor: 'var(--path-b)' }} />
              <stop offset="1" style={{ stopColor: 'var(--path-c)' }} />
            </linearGradient>
            <linearGradient id="auth-a" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--path-a)', stopOpacity: 0.28 }} />
              <stop offset="1" style={{ stopColor: 'var(--path-a)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path d="M70,88 L150,72 L215,74 L300,96 L360,60 L430,46 L430,120 L70,120 Z" fill="url(#auth-a)" />
          <path d="M70,88 L150,72 L215,74 L300,96 L360,60 L430,46" fill="none" style={{ stroke: 'var(--path-a)' }} strokeOpacity="0.7" strokeWidth="1.5" />
          <line x1="30" x2="460" y1="132" y2="132" stroke="url(#auth-g)" strokeWidth="4" strokeLinecap="round" />
          <line x1="460" x2="500" y1="132" y2="132" style={{ stroke: FAINT }} strokeWidth="2" strokeDasharray="2 7" />
          <line x1="460" x2="460" y1="30" y2="142" style={{ stroke: 'var(--hero-strong)' }} strokeOpacity="0.7" />
          <circle cx="30" cy="132" r="6" style={{ fill: 'var(--path-a)' }} />
          <circle cx="500" cy="132" r="6" fill="none" style={{ stroke: FAINT }} strokeWidth="2" />
          {DOTS.map(([x, c]) => <circle key={x} cx={x} cy="132" r="6.5" style={{ fill: c, stroke: 'var(--hero-solid)' }} strokeWidth="2.5" />)}
        </svg>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-logo"><Logo size={34} withWordmark /></div>
          {children}
        </div>
      </main>
    </div>
  );
}
