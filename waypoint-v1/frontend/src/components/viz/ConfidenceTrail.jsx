import { useRef, useState } from 'react';
import { Tooltip, CheckInDetail, statusColor } from './Tooltip.jsx';
import './viz.css';

/*
 * Modernised confidence sparkline. The old one was a bare 2-point line
 * with no scale — two Check-ins at the same confidence rendered as a
 * flat stroke that said nothing (Fred's scorecard, 2026-09-24). This
 * plots each Check-in as a dot coloured by its SCORE on a fixed 1–5
 * confidence band (faint guides at 1, 3 and 5, so height means the same
 * thing on every row), joined by a line; hovering anywhere snaps to the
 * nearest Check-in and shows its full detail.
 */
const W = 180;
const H = 44;
const PAD = 6;

export default function ConfidenceTrail({ checkIns, width = W }) {
  const ref = useRef(null);
  const [active, setActive] = useState(null);
  if (!checkIns?.length) return null;

  const n = checkIns.length;
  const pts = checkIns.map((ci, i) => ({
    ...ci,
    x: n === 1 ? width / 2 : PAD + (i / (n - 1)) * (width - PAD * 2),
    y: PAD + (1 - (Math.min(5, Math.max(1, Number(ci.confidence) || 1)) - 1) / 4) * (H - PAD * 2),
  }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  function move(e) {
    const rect = ref.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(p.x - px) < Math.abs(pts[best].x - px)) best = i; });
    setActive(best);
  }

  const a = active !== null ? pts[active] : null;
  return (
    <span className="vz-trail" ref={ref} onPointerMove={move} onPointerLeave={() => setActive(null)}
      tabIndex={0} onFocus={() => setActive(n - 1)} onBlur={() => setActive(null)}
      role="img" aria-label={`Confidence over ${n} check-in${n === 1 ? '' : 's'}: ${checkIns.map((c) => c.confidence).join(', ')} out of 5`}>
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`}>
        {[1, 3, 5].map((v) => {
          const y = PAD + (1 - (v - 1) / 4) * (H - PAD * 2);
          return <line key={v} x1="0" x2={width} y1={y} y2={y} stroke="var(--ink100)" strokeWidth="1" strokeDasharray={v === 3 ? '2 3' : undefined} />;
        })}
        {n > 1 && <path d={path} fill="none" stroke="var(--ink300)" strokeWidth="1.5" strokeLinejoin="round" />}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={active === i ? 5.5 : 4} fill={statusColor(p.scoreLabel)} stroke="var(--panel)" strokeWidth="2" />
        ))}
      </svg>
      {a && (
        <Tooltip x={a.x} y={a.y - 4} containerWidth={width}>
          <CheckInDetail checkIn={a} />
        </Tooltip>
      )}
    </span>
  );
}
