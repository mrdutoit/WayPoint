import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '../../utils/dateFormat.js';
import { positionInCycle, monthTicks, parseDay } from '../../utils/cycleMath.js';
import { Tooltip, CheckInDetail, statusColor, formatDay } from './Tooltip.jsx';
import './viz.css';

/*
 * The Cycle as a course, every Check-in a waypoint on it — extracted
 * from Dashboard.jsx (2026-09-24) so Scorecard uses the same hero.
 *
 * Interactive: moving anywhere over the plot snaps to the nearest
 * waypoint within reach (small dots are hard to hit precisely, so the
 * whole plot is the hover target) and shows its detail card; away from
 * any waypoint a scrub line shows the date under the cursor. Waypoints
 * are real buttons — Tab reaches each one, focus shows the same card,
 * Enter opens the Objective it belongs to.
 *
 * checkIns: [{ submittedAt, scoreLabel, confidence, comment,
 *              keyResultTitle, objectiveId, objectiveTitle }]
 */

const W = 1000;
const H = 150;
const COURSE_Y = 122;
const PROFILE_TOP = 22;
const PROFILE_BOTTOM = 92;
const SNAP_PX = 26;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function confidenceY(value) {
  const clamped = Math.min(5, Math.max(1, Number(value) || 1));
  return PROFILE_BOTTOM - ((clamped - 1) / 4) * (PROFILE_BOTTOM - PROFILE_TOP);
}

export default function CourseLine({ cycle, progress, checkIns, whose = 'your' }) {
  const navigate = useNavigate();
  const plotRef = useRef(null);
  const [active, setActive] = useState(null); // waypoint index
  const [scrub, setScrub] = useState(null); // { px, fraction }
  const [plotWidth, setPlotWidth] = useState(0);

  const todayX = progress.fraction * W;
  const ticks = monthTicks(cycle.startDate, cycle.endDate);

  const { waypoints, profile } = useMemo(() => {
    const pts = checkIns
      .map((ci) => ({ ...ci, x: (positionInCycle(ci.submittedAt, cycle.startDate, cycle.endDate) ?? 0) * W }))
      .sort((a, b) => a.x - b.x);

    const byDay = new Map();
    for (const p of pts) {
      const key = Math.round(p.x);
      const entry = byDay.get(key) ?? { x: p.x, sum: 0, n: 0 };
      entry.sum += Number(p.confidence) || 0;
      entry.n += 1;
      byDay.set(key, entry);
    }
    const prof = [...byDay.values()].map((d) => ({ x: d.x, y: confidenceY(d.sum / d.n) }));

    const stack = new Map();
    const wps = pts.map((p) => {
      const key = Math.round(p.x / 6);
      const n = stack.get(key) ?? 0;
      stack.set(key, n + 1);
      return { ...p, y: COURSE_Y - n * 11 };
    });
    return { waypoints: wps, profile: prof };
  }, [checkIns, cycle.startDate, cycle.endDate]);

  const profilePath = profile.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = profile.length > 1
    ? `${profilePath} L${profile[profile.length - 1].x.toFixed(1)},${PROFILE_BOTTOM} L${profile[0].x.toFixed(1)},${PROFILE_BOTTOM} Z`
    : null;

  function handleMove(event) {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPlotWidth(rect.width);
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    let best = null;
    let bestDist = Infinity;
    waypoints.forEach((wp, i) => {
      const wx = (wp.x / W) * rect.width;
      const wy = (wp.y / H) * rect.height;
      const dist = Math.hypot(wx - px, (wy - py) * 0.35); // horizontal distance dominates
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    if (best !== null && bestDist <= SNAP_PX) {
      setActive(best);
      setScrub(null);
    } else {
      setActive(null);
      setScrub({ px, fraction: Math.min(1, Math.max(0, px / rect.width)) });
    }
  }

  function clear() {
    setActive(null);
    setScrub(null);
  }

  const start = parseDay(cycle.startDate);
  const end = parseDay(cycle.endDate);
  const scrubDate = scrub && start && end
    ? new Date(start.getTime() + scrub.fraction * (end.getTime() + 86400000 - start.getTime()))
    : null;

  const activeWp = active !== null ? waypoints[active] : null;
  const label = `${cycle.name}: day ${progress.dayNumber} of ${progress.totalDays}, ${checkIns.length} check-in${checkIns.length === 1 ? '' : 's'} recorded so far.`;

  return (
    <div className="db-course">
      {!progress.afterEnd && !progress.beforeStart && (
        <span className="db-today" style={{ left: `${progress.fraction * 100}%` }}>Today</span>
      )}
      <div className="db-course-plot" ref={plotRef} onPointerMove={handleMove} onPointerLeave={clear}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
          <defs>
            <linearGradient id="db-course-grad" gradientUnits="userSpaceOnUse" x1="0" x2={W} y1="0" y2="0">
              <stop offset="0%" stopColor="#6fe8ff" />
              <stop offset="100%" stopColor="#2e8cf0" />
            </linearGradient>
            <linearGradient id="db-profile-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#6fe8ff" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#6fe8ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <line key={t.date.toISOString()} x1={t.fraction * W} x2={t.fraction * W} y1={PROFILE_TOP - 6} y2={COURSE_Y + 8} stroke="rgba(148,163,184,0.22)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {areaPath && <path className="db-course-profile" d={areaPath} fill="url(#db-profile-grad)" />}
          {profile.length > 1 && (
            <path className="db-course-profile" d={profilePath} fill="none" stroke="#6fe8ff" strokeOpacity="0.7" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          )}
          <line x1={todayX} x2={W} y1={COURSE_Y} y2={COURSE_Y} stroke="rgba(148,163,184,0.45)" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {todayX > 0 && (
            <g className="db-course-elapsed">
              <rect x="0" y={COURSE_Y - 2} width={todayX} height="4" rx="2" fill="url(#db-course-grad)" />
            </g>
          )}
          {!progress.afterEnd && (
            <line x1={todayX} x2={todayX} y1={PROFILE_TOP - 8} y2={COURSE_Y + 10} stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
          )}
        </svg>

        {/* HTML, not SVG: the SVG stretches (preserveAspectRatio="none"),
            which would squash circles into ellipses on narrow screens. */}
        <span className="db-buoy db-buoy-start" style={{ left: 0, top: `${(COURSE_Y / H) * 100}%` }} />
        <span className="db-buoy db-buoy-end" style={{ left: '100%', top: `${(COURSE_Y / H) * 100}%` }} />

        {scrub && scrubDate && (
          <div className="db-scrub" style={{ left: scrub.px }}>
            <span className="db-scrub-label">{formatDay(scrubDate)}</span>
          </div>
        )}

        {waypoints.map((wp, i) => (
          <button
            type="button"
            key={i}
            className={`db-waypoint${i === active ? ' active' : ''}`}
            style={{ left: `${(wp.x / W) * 100}%`, top: `${(wp.y / H) * 100}%`, background: statusColor(wp.scoreLabel) }}
            aria-label={`${wp.keyResultTitle}: ${wp.scoreLabel}, confidence ${wp.confidence} of 5, ${formatDate(String(wp.submittedAt).slice(0, 10))}`}
            onFocus={(e) => { setPlotWidth(plotRef.current?.getBoundingClientRect().width ?? 0); setActive(i); }}
            onBlur={() => setActive(null)}
            onClick={() => wp.objectiveId && navigate(`/objectives/${wp.objectiveId}`)}
          />
        ))}

        {activeWp && (
          <Tooltip
            x={(activeWp.x / W) * (plotWidth || plotRef.current?.getBoundingClientRect().width || 0)}
            y={(activeWp.y / H) * (plotRef.current?.getBoundingClientRect().height || H)}
            containerWidth={plotWidth}
          >
            <CheckInDetail checkIn={activeWp} keyResultTitle={activeWp.keyResultTitle} objectiveTitle={activeWp.objectiveTitle} />
          </Tooltip>
        )}
      </div>

      <div style={{ position: 'relative', height: 20, marginTop: 4, fontSize: 12, color: 'var(--ink500)', fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ position: 'absolute', left: 0 }}>{formatDate(cycle.startDate)}</span>
        {ticks.filter((t) => t.fraction > 0.14 && t.fraction < 0.86).map((t) => (
          <span key={t.date.toISOString()} className="db-course-month" style={{ position: 'absolute', left: `${t.fraction * 100}%`, transform: 'translateX(-50%)' }}>
            {MONTHS[t.date.getMonth()]}
          </span>
        ))}
        <span style={{ position: 'absolute', right: 0 }}>{formatDate(cycle.endDate)}</span>
      </div>

      <div className="db-course-legend">
        <span><span className="db-dot" style={{ background: 'linear-gradient(90deg,#6fe8ff,#2e8cf0)', width: 16, borderRadius: 2, height: 4 }} />Course so far</span>
        <span><span className="db-dot" style={{ background: statusColor('On Track') }} />Each dot is one of {whose} check-ins, coloured by its score. Hover for detail</span>
        {checkIns.length > 1 && <span><span className="db-dot" style={{ background: '#6fe8ff', opacity: 0.6, width: 16, borderRadius: 2, height: 2 }} />Confidence</span>}
      </div>
    </div>
  );
}
