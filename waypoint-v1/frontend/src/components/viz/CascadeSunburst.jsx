import { useMemo, useRef, useState } from 'react';
import { buildObjectiveTree } from '../../utils/objectiveTree.js';
import { useElementWidth } from '../../hooks/useElementWidth.js';
import { Tooltip, StatusText, statusColor } from './Tooltip.jsx';
import './viz.css';

/*
 * Cascade sunburst — PROPOSAL (2026-09-25), not yet wired into any page.
 *
 * The whole cascade as rings: one ring per cascade level, inside out.
 * An Objective's slice spans the leaves beneath it, so heavy branches
 * read as wide; colour is its rolled-up status. Rings are placed by
 * cascade LEVEL (like the Alignment Map's columns), so an Objective that
 * isn't linked to anything above it floats in its own ring with nothing
 * beneath it — the gap itself shows the missing link.
 *
 * Hover or focus a slice to light its lineage and see its detail; click
 * to hand its id to onSelect (the Alignment Map would scroll its canvas
 * to that card). Labels are drawn along the arc wherever a slice is long
 * enough to hold one legibly.
 *
 * objectives: the Alignment Map rows (id, title, status, parentObjectiveId,
 *             cascadeLevel, cascadeLevelIndex, ownerFirstName, ownerLastName)
 */

const SIZE = 460;
const C = SIZE / 2;
const HOLE = 62;
const RING_W = [44, 40, 36, 32, 30];
const RING_GAP = 4;
const SLICE_GAP_PX = 2.5;

function leafCount(node) {
  return node.children.length ? node.children.reduce((s, c) => s + leafCount(c), 0) : 1;
}

function isAncestor(byId, candidate, of) {
  let cur = byId.get(of);
  while (cur?.parentObjectiveId) {
    if (cur.parentObjectiveId === candidate) return true;
    cur = byId.get(cur.parentObjectiveId);
  }
  return false;
}

function polar(angle, r) {
  return [C + Math.sin(angle) * r, C - Math.cos(angle) * r];
}

function slicePath(a0, a1, r0, r1) {
  // Constant pixel gap between neighbouring slices, at both radii.
  const p1 = Math.min(SLICE_GAP_PX / r1 / 2, (a1 - a0) / 4);
  const p0 = Math.min(SLICE_GAP_PX / r0 / 2, (a1 - a0) / 4);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(a0 + p1, r1);
  const [x1, y1] = polar(a1 - p1, r1);
  const [x2, y2] = polar(a1 - p0, r0);
  const [x3, y3] = polar(a0 + p0, r0);
  return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`;
}

// Arc for a text label, reversed on the lower half so text never reads upside down.
function labelPath(a0, a1, r) {
  const mid = (a0 + a1) / 2;
  const lower = mid > Math.PI / 2 && mid < (3 * Math.PI) / 2;
  const [xs, ys] = polar(lower ? a1 : a0, r);
  const [xe, ye] = polar(lower ? a0 : a1, r);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return { d: `M${xs},${ys} A${r},${r} 0 ${large} ${lower ? 0 : 1} ${xe},${ye}`, lower };
}

export default function CascadeSunburst({ objectives, onSelect }) {
  const wrapRef = useRef(null);
  const width = useElementWidth(wrapRef);
  const [active, setActive] = useState(null);

  const { slices, levels, byId } = useMemo(() => {
    const levelList = [...new Set(objectives.map((o) => o.cascadeLevelIndex))].sort((a, b) => a - b);
    const ringOf = new Map(levelList.map((lvl, i) => [lvl, i]));
    const roots = buildObjectiveTree(objectives).sort((a, b) => a.cascadeLevelIndex - b.cascadeLevelIndex);
    const total = roots.reduce((s, r) => s + leafCount(r), 0);
    const out = [];
    let angle = 0;
    function place(node, a0, a1) {
      out.push({ node, a0, a1, ring: ringOf.get(node.cascadeLevelIndex) ?? 0 });
      const sum = leafCount(node);
      let a = a0;
      for (const child of node.children) {
        const span = (a1 - a0) * (leafCount(child) / sum);
        place(child, a, a + span);
        a += span;
      }
    }
    for (const root of roots) {
      const span = (Math.PI * 2 * leafCount(root)) / total;
      place(root, angle, angle + span);
      angle += span;
    }
    const levelLabels = levelList.map((lvl) => objectives.find((o) => o.cascadeLevelIndex === lvl)?.cascadeLevel ?? '');
    return { slices: out, levels: levelLabels, byId: new Map(objectives.map((o) => [o.id, o])) };
  }, [objectives]);

  const lineage = useMemo(() => {
    if (!active) return null;
    const set = new Set([active]);
    let cur = byId.get(active);
    while (cur?.parentObjectiveId && byId.has(cur.parentObjectiveId)) { set.add(cur.parentObjectiveId); cur = byId.get(cur.parentObjectiveId); }
    const stack = [active];
    while (stack.length) {
      const id = stack.pop();
      for (const o of objectives) if (o.parentObjectiveId === id && !set.has(o.id)) { set.add(o.id); stack.push(o.id); }
    }
    return set;
  }, [active, byId, objectives]);

  const radii = levels.map((_, i) => {
    const r0 = HOLE + RING_W.slice(0, i).reduce((s, w) => s + w + RING_GAP, 0);
    return [r0, r0 + (RING_W[i] ?? 28)];
  });
  const scale = width ? Math.min(width, SIZE) / SIZE : 1;

  const onCourse = objectives.filter((o) => ['On Track', 'Achieved'].includes(o.status)).length;
  const activeObj = active ? byId.get(active) : null;
  const activeSlice = active ? slices.find((s) => s.node.id === active) : null;
  let tip = null;
  if (activeSlice) {
    const mid = (activeSlice.a0 + activeSlice.a1) / 2;
    const [tx, ty] = polar(mid, radii[activeSlice.ring][1] + 6);
    tip = { x: tx * scale, y: ty * scale };
  }

  return (
    <div className="vz-sun" ref={wrapRef} onPointerLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Cascade of ${objectives.length} objectives across ${levels.length} levels`}>
        <defs>
          {slices.map((s) => {
            const [r0, r1] = radii[s.ring];
            const { d } = labelPath(s.a0, s.a1, (r0 + r1) / 2 - 4);
            return <path key={`lp-${s.node.id}`} id={`sun-lp-${s.node.id}`} d={d} fill="none" />;
          })}
        </defs>

        {/* faint ring guides, so empty stretches (unlinked, or nothing beneath) still read as rings */}
        {radii.map(([r0, r1], i) => (
          <circle key={i} cx={C} cy={C} r={(r0 + r1) / 2} fill="none" stroke="rgba(148,163,184,0.10)" strokeWidth={r1 - r0} />
        ))}

        {slices.map((s) => {
          const [r0, r1] = radii[s.ring];
          const lit = !lineage || lineage.has(s.node.id);
          const arcLen = (s.a1 - s.a0) * ((r0 + r1) / 2);
          const maxChars = Math.floor((arcLen - 14) / 6.2);
          const title = s.node.title;
          // Label only when it stays meaningful: the whole title, or a cut that
          // keeps at least 16 characters. Stubs like "Grow my…" add clutter,
          // not information — hover carries the detail.
          const text = title.length <= maxChars ? title : maxChars >= 17 ? `${title.slice(0, maxChars - 1)}\u2026` : null;
          return (
            <g key={s.node.id}>
              <path
                className={`vz-sun-slice${active === s.node.id ? ' active' : ''}`}
                d={slicePath(s.a0, s.a1, r0, r1)}
                fill={statusColor(s.node.status)}
                fillOpacity={lit ? (active && active !== s.node.id ? 0.78 : 0.92) : 0.13}
                tabIndex={0}
                role="button"
                aria-label={`${s.node.cascadeLevel}: ${s.node.title}, ${s.node.status}, ${s.node.ownerFirstName} ${s.node.ownerLastName}`}
                onPointerEnter={() => setActive(s.node.id)}
                onFocus={() => setActive(s.node.id)}
                onBlur={() => setActive(null)}
                onClick={() => onSelect?.(s.node.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelect?.(s.node.id); }}
              />
              {text && (
                <text className="vz-sun-label" style={{ opacity: lit ? 1 : 0.25 }} dy="4">
                  <textPath href={`#sun-lp-${s.node.id}`} startOffset="50%" textAnchor="middle">{text}</textPath>
                </text>
              )}
            </g>
          );
        })}

        <circle cx={C} cy={C} r={HOLE - 6} fill="rgba(11,27,58,0.9)" stroke="rgba(111,232,255,0.18)" />
      </svg>

      <div className="vz-sun-centre" style={{ width: (HOLE - 8) * 2 * scale, height: (HOLE - 8) * 2 * scale }}>
        {activeObj ? (
          <>
            <span className="vz-sun-fig" style={{ color: statusColor(activeObj.status) }}>{lineage ? [...lineage].filter((id) => id !== active && !isAncestor(byId, id, active)).length : 0}</span>
            <span className="vz-sun-cap">linked beneath it</span>
          </>
        ) : (
          <>
            <span className="vz-sun-fig">{onCourse}/{objectives.length}</span>
            <span className="vz-sun-cap">on track or achieved</span>
          </>
        )}
      </div>

      {activeObj && tip && width > 0 && (
        <Tooltip x={tip.x} y={tip.y} containerWidth={width} below={tip.y < 140 * scale}>
          <div className="vz-tip-title">{activeObj.title}</div>
          <div className="vz-tip-sub">{activeObj.cascadeLevel}, {activeObj.ownerFirstName} {activeObj.ownerLastName}</div>
          <div className="vz-tip-row"><span className="vz-tip-label">Status</span><StatusText status={activeObj.status} /></div>
          <div className="vz-tip-row"><span className="vz-tip-label">Linked below</span><span>{objectives.filter((o) => o.parentObjectiveId === activeObj.id).length}</span></div>
          {onSelect && <div className="vz-tip-row"><span className="vz-tip-label">Click to find it on the map</span><span /></div>}
        </Tooltip>
      )}

    </div>
  );
}
