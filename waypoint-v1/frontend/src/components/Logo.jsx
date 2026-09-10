/**
 * components/Logo.jsx — WayPoint mark.
 *
 * The icon is a real image (public/waypoint-icon.png), not hand-coded
 * SVG paths — after several rounds of trying to hand-trace the mark's
 * geometry from a reference image and not landing it, we switched to
 * using the actual source image directly (cropped to just the icon,
 * corners re-masked to sit cleanly on its own). See the design
 * reference this shipped from if the icon ever needs re-exporting at a
 * different size — it's a straightforward crop + rounded-rect alpha
 * mask, not a redraw.
 *
 * It's a symbolic icon, not a monogram — it doesn't spell the name — so
 * anywhere it appears without the full app-icon context (nav bar, login
 * page) should pair it with the wordmark via withWordmark, or the brand
 * name disappears.
 *
 * The wordmark itself stays real, coded text (Baloo 2, loaded via
 * index.html — see that file) with a CSS gradient on "Point" — that
 * part was never the problem and there's no reason to rasterise it.
 */
import { colors } from '../styles/tokens.js';

export function Logo({ size = 30, withWordmark = false, dark = false }) {
  const mark = (
    <img
      src="/waypoint-icon.png"
      alt="WayPoint"
      width={size}
      height={size}
      style={{ flexShrink: 0, display: 'block', borderRadius: Math.round(size * 0.19) }}
    />
  );

  if (!withWordmark) return mark;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {mark}
      <div style={{
        fontFamily: "'Baloo 2', -apple-system, sans-serif",
        fontWeight: 800, fontSize: Math.round(size * 0.62),
        letterSpacing: '-0.01em', lineHeight: 1,
      }}>
        <span style={{ color: dark ? '#fff' : colors.ink900 }}>Way</span>
        <span style={{
          background: 'linear-gradient(90deg, #6FE8FF 0%, #1A5FD0 100%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>Point</span>
      </div>
    </div>
  );
}
export default Logo;
