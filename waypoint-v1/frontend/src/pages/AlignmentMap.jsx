import { useEffect, useMemo, useRef, useState } from 'react';
import { useElementWidth } from '../hooks/useElementWidth.js';
import { Link, useNavigate } from 'react-router-dom';
import { useTerms } from '../context/TerminologyContext.jsx';
import { reportsApi } from '../services/api.js';
import { Avatar } from '../components/Avatar.jsx';
import { formatDate } from '../utils/dateFormat.js';
import { strategyLayout, lineageOf } from '../utils/strategyLayout.js';
import StatusRing from '../components/viz/StatusRing.jsx';
import CascadeSunburst from '../components/viz/CascadeSunburst.jsx';
import { statusColor } from '../components/viz/Tooltip.jsx';
import './dashboard.css';
import './reports.css';
import './alignment.css';

/*
 * Alignment Map (FR-033) — 2026-09-24 redesign.
 *
 * Was: an indented list with +/- buttons. Now a strategy canvas on the
 * navy chart panel: one column per cascade level, each Objective a card,
 * curved connectors from parent to child coloured by the child's status.
 * Hovering (or focusing) a card lights its whole lineage — everything it
 * rolls up into and everything that rolls up into it — and dims the rest,
 * which is the question this report exists to answer. Collapse/expand
 * per card (Sam's Stage 2 review requirement), plus expand/collapse all;
 * large maps start collapsed below the second level. Layout is the pure,
 * tested utils/strategyLayout.js. This also covers the backlog's "visual
 * strategy map" item.
 */

// Card width adapts to the panel so a typical four-level cascade fits
// without scrolling; below the minimum it scrolls horizontally instead.
const CARD_W_MIN = 176;
const CARD_W_MAX = 248;
const CARD_H = 106;
const COL_GAP = 52;
const ROW_H = 124;
const PAD = 24;
const HEAD_H = 56;
const AUTO_COLLAPSE_OVER = 40;

let CARD_W = 232; // set per render from the measured panel width
function colX(col) { return PAD + col * (CARD_W + COL_GAP); }
function rowY(row) { return HEAD_H + PAD + row * ROW_H; }

export default function AlignmentMap() {
  const navigate = useNavigate();
  const { t, tPlural } = useTerms();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(null); // Set, initialised once data arrives
  const [focus, setFocus] = useState(null);
  const scrollRef = useRef(null);
  const panelWidth = useElementWidth(scrollRef);

  useEffect(() => {
    reportsApi.alignmentMap()
      .then((d) => {
        setData(d);
        // Small maps open fully; big ones start collapsed below level two.
        const initial = new Set();
        if ((d.objectives?.length ?? 0) > AUTO_COLLAPSE_OVER) {
          const levels = [...new Set(d.objectives.map((o) => o.cascadeLevelIndex))].sort((a, b) => a - b);
          for (const o of d.objectives) if (o.cascadeLevelIndex >= (levels[1] ?? Infinity)) initial.add(o.id);
        }
        setCollapsed(initial);
      })
      .catch((err) => setError(err.message ?? 'Failed to load the alignment map'));
  }, []);

  const objectives = data?.objectives ?? [];
  const layout = useMemo(() => strategyLayout(objectives, collapsed ?? new Set()), [objectives, collapsed]);
  const lineage = useMemo(() => (focus ? lineageOf(objectives, focus) : null), [objectives, focus]);
  const nodeById = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);

  const levelInfo = useMemo(() => {
    const m = new Map();
    for (const o of objectives) {
      if (!m.has(o.cascadeLevelIndex)) m.set(o.cascadeLevelIndex, { label: o.cascadeLevel, items: [] });
      m.get(o.cascadeLevelIndex).items.push(o);
    }
    return m;
  }, [objectives]);

  function toggle(id) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  let body;
  if (error) body = <div className="db-empty">The alignment map couldn&apos;t load ({error}).</div>;
  else if (!data) body = <div className="db-skeleton" aria-label="Loading" />;
  else if (!data.cycle) body = <div className="db-empty">No active {t('Cycle').toLowerCase()} right now.</div>;
  else if (objectives.length === 0) body = <div className="db-empty">No {tPlural('Objective').toLowerCase()} this {t('Cycle').toLowerCase()} yet.</div>;
  else {
    const topLevel = layout.columns[0];
    const belowTop = objectives.filter((o) => o.cascadeLevelIndex !== topLevel);
    const linked = belowTop.filter((o) => o.parentObjectiveId && objectives.some((p) => p.id === o.parentObjectiveId));
    const unlinked = belowTop.filter((o) => !linked.includes(o));
    const onCourse = objectives.filter((o) => ['On Track', 'Achieved'].includes(o.status)).length;
    // Branches (second level) ranked by how much of what sits beneath them is off track or at risk.
    const secondLevel = layout.columns[1];
    const hotBranches = objectives.filter((o) => o.cascadeLevelIndex === secondLevel).map((o) => {
      const desc = [...lineageOf(objectives, o.id)].filter((x) => x !== o.id && objectives.find((y) => y.id === x)?.cascadeLevelIndex > o.cascadeLevelIndex);
      const all = [o.id, ...desc].map((x) => objectives.find((y) => y.id === x));
      return { ...o, size: all.length, bad: all.filter((y) => ['Off Track', 'At Risk'].includes(y.status)).length };
    }).filter((b) => b.bad > 0).sort((a, b) => b.bad / b.size - a.bad / a.size).slice(0, 4);
    const cols = layout.columns.length;
    const fitted = panelWidth ? (panelWidth - PAD * 2 - (cols - 1) * COL_GAP) / cols : 232;
    CARD_W = Math.round(Math.min(CARD_W_MAX, Math.max(CARD_W_MIN, fitted)));
    const width = colX(cols - 1) + CARD_W + PAD;
    const height = rowY(Math.max(layout.rowCount - 1, 0)) + CARD_H + PAD;
    const hasCollapsible = objectives.some((o) => objectives.some((c) => c.parentObjectiveId === o.id));

    body = (
      <>
        <section className="db-hero am-sun-panel" data-theme="dark">
          <div className="am-sun-grid">
            <CascadeSunburst objectives={objectives} onSelect={(oid) => { setFocus(oid); document.querySelector(`[data-node="${oid}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} />
            <div className="am-sun-side">
              <h2 className="rp-hero-title">The cascade at a glance</h2>
              <p className="rp-hero-note" style={{ marginBottom: 14 }}>Rings from the centre out: {layout.columns.map((l) => levelInfo.get(l).label).join(', ')}. Each slice is as wide as the work beneath it. Hover to trace a branch; click to find it on the map below.</p>
              <div className="am-sun-hot">
                <div className="am-sun-hot-head">Where the trouble sits</div>
                {hotBranches.map((b) => (
                  <button type="button" key={b.id} className="am-sun-hot-item" onClick={() => document.querySelector(`[data-node="${b.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                    <span className="vz-dot" style={{ background: statusColor(b.status) }} />
                    <span className="am-sun-hot-title">{b.title}</span>
                    <span className="am-sun-hot-n">{b.bad} of {b.size}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="db-glance">
          <section className="vz-panel">
            <h2 className="vz-panel-title">Every {t('Objective').toLowerCase()}</h2>
            <p className="vz-panel-note">Across all levels this {t('Cycle').toLowerCase()}</p>
            <StatusRing items={objectives} noun={tPlural('Objective').toLowerCase()}
              headline={{ figure: `${onCourse}/${objectives.length}`, caption: 'on track or achieved' }} />
          </section>
          <section className="vz-panel">
            <h2 className="vz-panel-title">Alignment</h2>
            <p className="vz-panel-note">Below the top level, linked to a parent</p>
            <div className="am-align-figure db-display">
              {belowTop.length ? Math.round((linked.length / belowTop.length) * 100) : 100}%
              <small>{linked.length} of {belowTop.length}</small>
            </div>
            {unlinked.length > 0 ? (
              <div className="am-unlinked">
                <div className="am-unlinked-head">Not linked to anything above</div>
                {unlinked.slice(0, 4).map((o) => (
                  <Link key={o.id} to={`/objectives/${o.id}`} className="am-unlinked-item">
                    <span className="vz-dot" style={{ background: statusColor(o.status) }} />{o.title}
                  </Link>
                ))}
                {unlinked.length > 4 && <div className="db-section-note">and {unlinked.length - 4} more</div>}
              </div>
            ) : <p className="vz-panel-note" style={{ marginTop: 10 }}>Everything below the top level rolls up into something.</p>}
          </section>
          <section className="vz-panel">
            <h2 className="vz-panel-title">By level</h2>
            <p className="vz-panel-note">Status mix at each level of the cascade</p>
            <div className="am-levels">
              {layout.columns.map((lvl) => {
                const info = levelInfo.get(lvl);
                const counts = new Map();
                for (const o of info.items) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
                return (
                  <div key={lvl} className="am-level">
                    <span className="am-level-name">{info.label}</span>
                    <span className="db-bar">
                      {[...counts.entries()].map(([st, n]) => (
                        <span key={st} title={`${n} ${st}`} style={{ width: `${(n / info.items.length) * 100}%`, background: statusColor(st) }} />
                      ))}
                    </span>
                    <span className="am-level-count">{info.items.length}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <section className="rp-section">
          <div className="db-section-head">
            <h2 className="db-section-title db-display">The cascade</h2>
            {hasCollapsible && (
              <div className="am-tools">
                <button type="button" onClick={() => setCollapsed(new Set())}>Expand all</button>
                <button type="button" onClick={() => setCollapsed(new Set(objectives.filter((o) => o.cascadeLevelIndex === topLevel).map((o) => o.id)))}>Top level only</button>
              </div>
            )}
          </div>
          <div className="am-canvas-wrap db-hero" data-theme="dark">
            <p className="am-hint">Hover an {t('Objective').toLowerCase()} to trace everything it rolls up into and everything that feeds it.</p>
            <div className="am-scroll" ref={scrollRef}>
              <div className="am-canvas" style={{ width, height }} onPointerLeave={() => setFocus(null)}>
                {layout.columns.map((lvl, i) => {
                  const info = levelInfo.get(lvl);
                  return (
                    <div key={lvl} className="am-colhead" style={{ left: colX(i), width: CARD_W }}>
                      <span>{info.label}</span><small>{info.items.length}</small>
                    </div>
                  );
                })}
                <svg className="am-edges" width={width} height={height} aria-hidden="true">
                  {layout.edges.map(({ from, to }) => {
                    const a = nodeById.get(from);
                    const b = nodeById.get(to);
                    const x1 = colX(a.col) + CARD_W;
                    const y1 = rowY(a.row) + CARD_H / 2;
                    const x2 = colX(b.col);
                    const y2 = rowY(b.row) + CARD_H / 2;
                    const mx = (x1 + x2) / 2;
                    const lit = lineage ? lineage.has(from) && lineage.has(to) : true;
                    return (
                      <path key={`${from}-${to}`} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                        fill="none" stroke={statusColor(b.status)} strokeWidth={lineage && lit ? 2.5 : 1.5}
                        strokeOpacity={lit ? (lineage ? 0.95 : 0.55) : 0.12} className="am-edge" />
                    );
                  })}
                </svg>
                {layout.nodes.map((n) => {
                  const dim = lineage && !lineage.has(n.id);
                  const isCollapsed = collapsed?.has(n.id);
                  return (
                    <div
                      key={n.id}
                      data-node={n.id}
                      className={`am-node${dim ? ' dim' : ''}${focus === n.id ? ' focus' : ''}`}
                      style={{ left: colX(n.col), top: rowY(n.row), width: CARD_W, height: CARD_H, '--status': statusColor(n.status) }}
                      onPointerEnter={() => setFocus(n.id)}
                    >
                      <button type="button" className="am-node-main" onFocus={() => setFocus(n.id)} onBlur={() => setFocus(null)}
                        onClick={() => navigate(`/objectives/${n.id}`)}
                        aria-label={`${n.title}, ${n.cascadeLevel}, ${n.status}, owned by ${n.ownerFirstName} ${n.ownerLastName}`}>
                        <span className="am-node-status"><span className="vz-dot" style={{ background: statusColor(n.status) }} />{n.status}</span>
                        <span className="am-node-title">{n.title}</span>
                        <span className="am-node-owner">
                          <Avatar firstName={n.ownerFirstName} lastName={n.ownerLastName} size={18} />
                          {n.ownerFirstName} {n.ownerLastName}
                        </span>
                      </button>
                      {n.childCount > 0 && (
                        <button type="button" className="am-node-toggle" onClick={() => toggle(n.id)}
                          aria-label={isCollapsed ? `Show ${n.childCount} linked ${n.childCount === 1 ? t('Objective') : tPlural('Objective')}` : 'Hide linked objectives'}
                          aria-expanded={!isCollapsed}>
                          {isCollapsed ? `+${n.childCount}` : '\u2212'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <div className="db">
      <Link to="/reports" className="db-link">&larr; Reports</Link>
      <div className="rp-head">
        <div>
          <h1 className="rp-title">Alignment map</h1>
          <p className="rp-sub">How every {t('Objective').toLowerCase()} in the organisation connects, from the top of the cascade down, with each one&apos;s rolled-up status.</p>
        </div>
        {data?.cycle && <div className="rp-cycle"><strong>{data.cycle.name}</strong>Closes {formatDate(data.cycle.endDate)}</div>}
      </div>
      {body}
    </div>
  );
}
