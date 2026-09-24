import { useMemo, useRef, useState } from 'react';
import { parseDay } from '../../utils/cycleMath.js';
import { useElementWidth } from '../../hooks/useElementWidth.js';
import { Tooltip } from './Tooltip.jsx';
import './viz.css';

/*
 * Check-in cadence across a Cycle, one cell per day — the modernised
 * successor to charts/CalendarHeatmap.jsx (a 7-row GitHub-style grid).
 * A single-row strip fits inside a person's row, lines up day-for-day
 * with every other person's strip on the same page (so gaps and bursts
 * are comparable down the list), and reads left-to-right like the
 * Dashboard's course line. Days after today are drawn lighter; month
 * starts get a faint marker. Hover or focus a day for its count.
 *
 * checkInsByDate: [{ date: 'YYYY-MM-DD', count }]
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400000;

function intensity(count) {
  if (!count) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
}

export default function CadenceStrip({ cycle, checkInsByDate, label }) {
  const ref = useRef(null);
  const width = useElementWidth(ref);
  const [active, setActive] = useState(null);

  const days = useMemo(() => {
    const start = parseDay(cycle?.startDate);
    const end = parseDay(cycle?.endDate);
    if (!start || !end) return [];
    const counts = new Map((checkInsByDate ?? []).map((d) => [String(d.date).slice(0, 10), Number(d.count) || 0]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const out = [];
    for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
      const d = new Date(t);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ date: d, key, count: counts.get(key) ?? 0, future: d > today, monthStart: d.getDate() === 1 });
    }
    return out;
  }, [cycle?.startDate, cycle?.endDate, checkInsByDate]);

  if (days.length === 0) return null;
  const total = days.reduce((s, d) => s + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;
  const a = active !== null ? days[active] : null;

  return (
    <div className="vz-cadence" ref={ref} onPointerLeave={() => setActive(null)}
      role="img" aria-label={`${label ?? 'Check-ins'}: ${total} across ${activeDays} day${activeDays === 1 ? '' : 's'} of ${days.length}`}>
      <div className="vz-cadence-cells" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d, i) => (
          <span
            key={d.key}
            className={`vz-cadence-cell l${intensity(d.count)}${d.future ? ' future' : ''}${d.monthStart ? ' month' : ''}${i === active ? ' active' : ''}`}
            onPointerEnter={() => setActive(i)}
          />
        ))}
      </div>
      {a && width > 0 && (
        <Tooltip x={((active + 0.5) / days.length) * width} y={0} containerWidth={width}>
          <div className="vz-tip-title">{a.date.getDate()} {MONTHS[a.date.getMonth()]} {a.date.getFullYear()}</div>
          <div className="vz-tip-row">
            <span className="vz-tip-label">{a.future ? 'Still ahead' : 'Check-ins'}</span>
            <strong>{a.future ? '' : a.count}</strong>
          </div>
        </Tooltip>
      )}
    </div>
  );
}
