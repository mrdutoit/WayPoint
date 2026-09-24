import { useState } from 'react';
import { statusColor } from './Tooltip.jsx';
import { groupByStatus } from '../../utils/statusGroups.js';
import './viz.css';

/*
 * Status distribution as horizontal bars — the modernised successor to
 * the Dashboard's old "Team key result status" Recharts bar chart.
 * Bars are scaled to the total (not the largest bar), so a bar's length
 * reads directly as its share; hovering a row isolates it and shows the
 * percentage.
 */
export default function StatusBars({ items }) {
  const [hover, setHover] = useState(null);
  const groups = groupByStatus(items);
  const total = items.length;
  if (total === 0) return <div className="vz-empty">Nothing to show yet.</div>;

  return (
    <div className={`vz-bars${hover ? ' hovering' : ''}`} role="list">
      {groups.map((g, i) => {
        const pct = Math.round((g.count / total) * 100);
        return (
          <div
            key={g.status}
            role="listitem"
            tabIndex={0}
            className={`vz-bar-row${hover === g.status ? ' active' : ''}`}
            onPointerEnter={() => setHover(g.status)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(g.status)}
            onBlur={() => setHover(null)}
            aria-label={`${g.status}: ${g.count}, ${pct}%`}
          >
            <span>{g.status}</span>
            <span className="vz-bar-track">
              <span className="vz-bar-fill" style={{ display: 'block', width: `${Math.max(pct, 2)}%`, background: statusColor(g.status), animationDelay: `${i * 70}ms` }} />
            </span>
            <span className="vz-bar-value">{hover === g.status ? <small>{pct}%</small> : g.count}</span>
          </div>
        );
      })}
    </div>
  );
}
