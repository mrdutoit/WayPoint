import { useState } from 'react';
import { statusColor } from './Tooltip.jsx';
import { groupByStatus } from '../../utils/statusGroups.js';
import './viz.css';

/*
 * Segmented status ring — the modernised successor to the Dashboard's
 * old completion ring + StatusDonut + stat row, folded into one
 * instrument: the centre carries the headline figure, the legend
 * carries every count. Hovering a segment or a legend row isolates that
 * status and swaps the centre to its count and share.
 *
 * items: [{ status }]   headline: { figure, caption } for the idle centre
 */

const SIZE = 132;
const STROKE = 14;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const GAP = 4; // px of arc between segments

export default function StatusRing({ items, headline, noun = 'items' }) {
  const [hover, setHover] = useState(null);
  const groups = groupByStatus(items);
  const total = items.length;

  if (total === 0) return <div className="vz-empty">Nothing to show yet.</div>;

  let offset = 0;
  const segments = groups.map((g) => {
    const len = (g.count / total) * C;
    const seg = { ...g, len: Math.max(len - (groups.length > 1 ? GAP : 0), 0.5), offset };
    offset += len;
    return seg;
  });

  const hovered = groups.find((g) => g.status === hover);

  return (
    <div className="vz-ring">
      <div className="vz-ring-svg" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img"
          aria-label={groups.map((g) => `${g.count} ${g.status}`).join(', ')}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--ink100)" strokeWidth={STROKE} />
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {segments.map((seg) => (
              <circle
                key={seg.status}
                className="seg"
                cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
                stroke={statusColor(seg.status)}
                strokeWidth={hover === seg.status ? STROKE + 4 : STROKE}
                strokeLinecap={groups.length > 1 ? 'butt' : 'round'}
                strokeDasharray={`${seg.len} ${C}`}
                strokeDashoffset={-seg.offset}
                opacity={hover && hover !== seg.status ? 0.3 : 1}
                onPointerEnter={() => setHover(seg.status)}
                onPointerLeave={() => setHover(null)}
              />
            ))}
          </g>
        </svg>
        <div className="vz-ring-centre">
          {hovered ? (
            <>
              <span className="vz-ring-figure" style={{ color: statusColor(hovered.status) }}>{hovered.count}</span>
              <span className="vz-ring-caption">{hovered.status}, {Math.round((hovered.count / total) * 100)}%</span>
            </>
          ) : (
            <>
              <span className="vz-ring-figure">{headline.figure}</span>
              <span className="vz-ring-caption">{headline.caption}</span>
            </>
          )}
        </div>
      </div>
      <div className="vz-legend">
        {groups.map((g) => (
          <button
            type="button"
            key={g.status}
            className={`vz-legend-item${hover === g.status ? ' active' : ''}${hover && hover !== g.status ? ' dim' : ''}`}
            onPointerEnter={() => setHover(g.status)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(g.status)}
            onBlur={() => setHover(null)}
            aria-label={`${g.count} ${noun} ${g.status}`}
          >
            <span className="vz-dot" style={{ background: statusColor(g.status) }} />
            <span>{g.status}</span>
            <span className="vz-legend-count">{g.count}</span>
          </button>
        ))}
        <div className="vz-legend-item" style={{ borderTop: '1px solid var(--line)', borderRadius: 0, marginTop: 4, paddingTop: 8 }}>
          <span />
          <span style={{ color: 'var(--ink500)' }}>Total {noun}</span>
          <span className="vz-legend-count">{total}</span>
        </div>
      </div>
    </div>
  );
}
