import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { positionInCycle, monthTicks } from '../../utils/cycleMath.js';
import { useElementWidth } from '../../hooks/useElementWidth.js';
import { Tooltip, CheckInDetail, statusColor } from './Tooltip.jsx';
import './viz.css';

/*
 * One course lane per person — the Dashboard's course line, repeated
 * for a team so passages can be compared down the page (Team Progress,
 * 2026-09-24). Lanes share one time axis: month ticks and today's marker
 * run through every lane. Hovering a lane snaps to its nearest
 * Check-in and shows the full detail card; each waypoint is a button
 * (Tab / Enter opens the Objective), same as CourseLine.
 *
 * lanes: [{ id, label (node), checkIns: [{ submittedAt, scoreLabel,
 *           confidence, comment, keyResultTitle, objectiveId, objectiveTitle }] }]
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SNAP_PX = 24;

function Lane({ lane, cycle, progress, plotWidth }) {
  const navigate = useNavigate();
  const [active, setActive] = useState(null);
  const pts = lane.checkIns.map((ci) => ({ ...ci, f: positionInCycle(ci.submittedAt, cycle.startDate, cycle.endDate) ?? 0 }));

  function move(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = null;
    let bestDist = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(p.f * rect.width - px); if (d < bestDist) { bestDist = d; best = i; } });
    setActive(best !== null && bestDist <= SNAP_PX ? best : null);
  }

  const a = active !== null ? pts[active] : null;
  return (
    <div className="vz-lane-plot" onPointerMove={move} onPointerLeave={() => setActive(null)}>
      <span className="vz-lane-track" />
      <span className="vz-lane-sailed" style={{ width: `${progress.fraction * 100}%` }} />
      {pts.map((p, i) => (
        <button
          type="button" key={i}
          className={`vz-lane-dot${i === active ? ' active' : ''}`}
          style={{ left: `${p.f * 100}%`, background: statusColor(p.scoreLabel) }}
          aria-label={`${p.keyResultTitle}: ${p.scoreLabel}, confidence ${p.confidence} of 5`}
          onFocus={() => setActive(i)} onBlur={() => setActive(null)}
          onClick={() => p.objectiveId && navigate(`/objectives/${p.objectiveId}`)}
        />
      ))}
      {pts.length === 0 && <span className="vz-lane-empty">No check-ins yet</span>}
      {a && plotWidth > 0 && (
        <Tooltip x={a.f * plotWidth} y={6} containerWidth={plotWidth}>
          <CheckInDetail checkIn={a} keyResultTitle={a.keyResultTitle} objectiveTitle={a.objectiveTitle} />
        </Tooltip>
      )}
    </div>
  );
}

export default function Lanes({ cycle, progress, lanes }) {
  const axisRef = useRef(null);
  const plotWidth = useElementWidth(axisRef);
  const ticks = monthTicks(cycle.startDate, cycle.endDate);
  return (
    <div className="vz-lanes">
      <div className="vz-lanes-grid">
        <span />
        <div className="vz-lanes-axis" ref={axisRef}>
          {ticks.map((t) => (
            <span key={t.date.toISOString()} className="vz-lanes-month" style={{ left: `${t.fraction * 100}%` }}>{MONTHS[t.date.getMonth()]}</span>
          ))}
          {!progress.afterEnd && !progress.beforeStart && (
            <span className="vz-lanes-today" style={{ left: `${progress.fraction * 100}%` }}>Today</span>
          )}
        </div>
        {lanes.map((lane) => (
          <div className="vz-lane" key={lane.id}>
            <div className="vz-lane-label">{lane.label}</div>
            <div className="vz-lane-body">
              {ticks.map((t) => <span key={t.date.toISOString()} className="vz-lanes-tick" style={{ left: `${t.fraction * 100}%` }} />)}
              {!progress.afterEnd && <span className="vz-lanes-now" style={{ left: `${progress.fraction * 100}%` }} />}
              <Lane lane={lane} cycle={cycle} progress={progress} plotWidth={plotWidth} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
