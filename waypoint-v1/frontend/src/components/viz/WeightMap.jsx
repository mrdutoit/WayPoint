import { useRef, useState } from 'react';
import { squarify } from '../../utils/squarify.js';
import { useElementWidth } from '../../hooks/useElementWidth.js';
import { Tooltip, StatusText, ConfidencePips, statusColor, formatStamp } from './Tooltip.jsx';
import './viz.css';

/*
 * Modernised weighting treemap, one per Objective.
 *
 * The old version pooled every Key Result from every Objective into one
 * treemap by raw weighting. That was misleading: weightings are only
 * normalised WITHIN an Objective (FR-016), so a weighting of 3 in one
 * Objective and 3 in another aren't comparable — and a Key Result from
 * a different Objective could appear as a meaningless sliver beside
 * them (Joe's scorecard, 2026-09-24). Now each Objective gets its own
 * map and each tile shows its share of THAT Objective's score.
 *
 * keyResults: [{ id, title, weighting, status, checkInHistory }]
 */
const LAYOUT_W = 1000;
const LAYOUT_H = 300;

export default function WeightMap({ keyResults, height = 200 }) {
  const ref = useRef(null);
  const [active, setActive] = useState(null);
  const measured = useElementWidth(ref);

  const total = keyResults.reduce((sum, kr) => sum + Math.max(Number(kr.weighting) || 0, 0), 0);
  const tiles = squarify(
    keyResults.map((kr) => ({ ...kr, value: Math.max(Number(kr.weighting) || 0, 0) })),
    { x: 0, y: 0, w: LAYOUT_W, h: LAYOUT_H }
  );
  if (tiles.length === 0) return <div className="vz-empty">No weighted key results yet.</div>;

  const activeTile = tiles.find((t) => t.id === active);
  const box = measured ? { width: measured } : null;

  return (
    <div className="vz-map" ref={ref} style={{ height }} onPointerLeave={() => setActive(null)}>
      {tiles.map((t) => {
        const share = total > 0 ? Math.round((t.value / total) * 100) : 0;
        const pxW = (t.w / LAYOUT_W) * (box?.width ?? 600);
        const pxH = (t.h / LAYOUT_H) * height;
        const size = pxW < 90 || pxH < 64 ? (pxW < 56 || pxH < 44 ? 'tiny' : 'small') : '';
        const unscored = t.status === 'Not Started' || !t.status;
        return (
          <div
            key={t.id}
            className={`vz-tile ${size}`}
            style={{ left: `${(t.x / LAYOUT_W) * 100}%`, top: `${(t.y / LAYOUT_H) * 100}%`, width: `${(t.w / LAYOUT_W) * 100}%`, height: `${(t.h / LAYOUT_H) * 100}%` }}
          >
            <div
              className={`vz-tile-inner${unscored ? ' unscored' : ''}`}
              style={{ background: statusColor(t.status) }}
              tabIndex={0}
              role="img"
              aria-label={`${t.title}: ${share}% of this objective, ${t.status}`}
              onPointerEnter={() => setActive(t.id)}
              onFocus={() => setActive(t.id)}
              onBlur={() => setActive(null)}
            >
              <span className="vz-tile-title">{t.title}</span>
              <span className="vz-tile-share">{share}%</span>
            </div>
          </div>
        );
      })}
      {activeTile && box && (() => {
        const last = activeTile.checkInHistory?.at(-1);
        const share = total > 0 ? Math.round((activeTile.value / total) * 100) : 0;
        const cx = ((activeTile.x + activeTile.w / 2) / LAYOUT_W) * box.width;
        const top = (activeTile.y / LAYOUT_H) * height;
        return (
          <Tooltip x={cx} y={top + 6} containerWidth={box.width}>
            <div className="vz-tip-title">{activeTile.title}</div>
            <div className="vz-tip-row"><span className="vz-tip-label">Share of score</span><strong>{share}%</strong></div>
            <div className="vz-tip-row"><span className="vz-tip-label">Weighting</span><span>{Number(activeTile.weighting)}</span></div>
            <div className="vz-tip-row"><span className="vz-tip-label">Status</span><StatusText status={activeTile.status} /></div>
            {last ? (
              <>
                <div className="vz-tip-row"><span className="vz-tip-label">Confidence</span><ConfidencePips value={last.confidence} /></div>
                <div className="vz-tip-row"><span className="vz-tip-label">Last check-in</span><span>{formatStamp(last.submittedAt)}</span></div>
              </>
            ) : (
              <div className="vz-tip-row"><span className="vz-tip-label">Last check-in</span><span>Never</span></div>
            )}
          </Tooltip>
        );
      })()}
    </div>
  );
}
