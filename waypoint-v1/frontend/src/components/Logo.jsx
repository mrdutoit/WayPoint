/**
 * components/Logo.jsx — WayPoint mark.
 *
 * W: round caps, full zigzag (two peaks, two valleys).
 * P: stem + single bowl (square cap, rounded corners) — same construction
 *    as a B's bowl, just one instead of two. Stem offset 10px right of
 *    W's last peak — no stroke overlap.
 * Single gradient (indigo -> violet) across the full mark width,
 * userSpaceOnUse. dark prop swaps in brightened colours for dark
 * backgrounds — mirrors the same two-variant pattern used elsewhere in
 * this codebase (see tokens.js) rather than introducing new CSS custom
 * properties.
 */
import { useId } from 'react';
import { colors } from '../styles/tokens.js';

const GRAD_STD    = ['#4338CA', '#4F46E5', '#7C3AED'];
const GRAD_BRIGHT = ['#6366F1', '#818CF8', '#A78BFA'];

export function Logo({ size = 30, withWordmark = false, dark = false }) {
  const uid  = useId().replace(/:/g, '');
  const gid  = `wpg-${uid}`;
  const cols = dark ? GRAD_BRIGHT : GRAD_STD;
  // Natural bbox incl. half-stroke (6.5): x 11.5-136.5, y 17.5-98.5
  // Aspect ratio 125:81 ~ 1.54
  const w = Math.round(size * 1.54);

  const mark = (
    <svg
      viewBox="11.5 17.5 125 81" width={w} height={size}
      role="img" aria-label="WayPoint"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <defs>
        <linearGradient id={gid} x1="18" y1="0" x2="130" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={cols[0]} />
          <stop offset="52%"  stopColor={cols[1]} />
          <stop offset="100%" stopColor={cols[2]} />
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${gid})`} strokeWidth="13" strokeLinejoin="round">
        {/* W — round caps, full zigzag */}
        <polyline points="18,24 36,92 54,50 72,92 90,24" strokeLinecap="round" />
        {/* P — stem + single bowl, square cap */}
        <path d="M100,92 L100,24 L118,24 Q130,24 130,36 L130,46 Q130,58 118,58 L100,58" strokeLinecap="square" />
      </g>
    </svg>
  );

  if (!withWordmark) return mark;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {mark}
      <div>
        <div style={{
          fontWeight: 800, fontSize: '1rem',
          color: dark ? '#fff' : colors.ink900, letterSpacing: '-0.02em', lineHeight: 1,
        }}>
          WayPoint
        </div>
        <div style={{
          fontSize: '0.625rem', color: dark ? colors.ink300 : colors.ink500,
          textTransform: 'uppercase', letterSpacing: '0.16em', marginTop: '3px',
        }}>
          OKR Tracking
        </div>
      </div>
    </div>
  );
}
export default Logo;
