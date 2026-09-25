import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import { useTerms } from '../context/TerminologyContext.jsx';
import { objectivesApi, cascadeLevelsApi, cyclesApi } from '../services/api.js';
import { s } from '../styles/tokens.js';
import { Avatar } from '../components/Avatar.jsx';
import { StatusText, statusColor } from '../components/viz/Tooltip.jsx';
import StatusRing from '../components/viz/StatusRing.jsx';
import { buildObjectiveTree } from '../utils/objectiveTree.js';
import { formatDate } from '../utils/dateFormat.js';
import './dashboard.css';
import './reports.css';
import './objectives.css';
import './alignment.css';
import Coverage from '../components/viz/Coverage.jsx';

/*
 * Objectives — 2026-09-24 redesign. The CRUD entry point (the Alignment
 * Map is the read-only picture; this is where Objectives are created and
 * opened). Hierarchy view keeps its collapsible tree, now with indent
 * guides, level tags and owners; List view is sortable-looking rows; a
 * "Mine" view filters to the caller's own. Creation form unchanged in
 * behaviour, restyled.
 *
 * Also a correctness fix: the page said "for the current Cycle" but
 * listed every Objective in the tenant across every Cycle (the list
 * endpoint isn't Cycle-scoped). It now shows the active Cycle's only —
 * all of them, unfiltered, when there is no active Cycle.
 */

function TreeNode({ node, depth, levelLabelById }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  return (
    <>
      <div className="ob-node" style={{ paddingLeft: 20 + depth * 28 }}>
        {Array.from({ length: depth }).map((_, i) => (
          <span key={i} className="ob-node-guide" style={{ left: 31 + i * 28 }} aria-hidden="true" />
        ))}
        {hasChildren ? (
          <button type="button" className="ob-node-toggle" onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded} aria-label={expanded ? 'Collapse' : `Expand ${node.children.length}`}>
            {expanded ? '\u2212' : '+'}
          </button>
        ) : <span className="ob-node-spacer" />}
        <span className="ob-node-main">
          <span className="ob-node-level">{levelLabelById[node.cascadeLevelId] ?? ''}</span>
          <Link to={`/objectives/${node.id}`} className="ob-node-title">{node.title}</Link>
          {!expanded && hasChildren && <span className="db-section-note">+{node.children.length}</span>}
          <Coverage reporting={node.inputsReporting} total={node.inputsTotal} variant="compact" />
        </span>
        <span className="ob-node-owner">
          <Avatar firstName={node.ownerFirstName} lastName={node.ownerLastName} size={22} />
          <span>{node.ownerFirstName} {node.ownerLastName}</span>
        </span>
        <StatusText status={node.status} />
      </div>
      {expanded && node.children.map((child) => (
        <TreeNode key={child.id} node={child} depth={depth + 1} levelLabelById={levelLabelById} />
      ))}
    </>
  );
}

export default function Objectives() {
  const { role, user } = useRole();
  const { t, tPlural } = useTerms();
  const [allObjectives, setAllObjectives] = useState(null);
  const [cascadeLevels, setCascadeLevels] = useState([]);
  const [activeCycle, setActiveCycle] = useState(null);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState('hierarchy');

  const canCreate = role === 'Manager' || role === 'Employee';

  function load() {
    return Promise.all([objectivesApi.list(), cascadeLevelsApi.list(), cyclesApi.list().catch(() => ({ cycles: [] }))])
      .then(([objResult, levelResult, cycleResult]) => {
        setAllObjectives(objResult?.objectives ?? []);
        setCascadeLevels(levelResult?.levels ?? []);
        setActiveCycle((cycleResult?.cycles ?? []).find((c) => c.status === 'Active') ?? null);
      })
      .catch((err) => setError(err.message ?? 'Failed to load Objectives'));
  }
  useEffect(() => { load(); }, []);

  const objectives = useMemo(() => {
    if (!allObjectives) return null;
    return activeCycle ? allObjectives.filter((o) => o.cycleId === activeCycle.id) : allObjectives;
  }, [allObjectives, activeCycle]);

  const levelLabelById = useMemo(() => Object.fromEntries(cascadeLevels.map((l) => [l.id, l.label])), [cascadeLevels]);
  const levelIndexById = useMemo(() => Object.fromEntries(cascadeLevels.map((l) => [l.id, l.level_index])), [cascadeLevels]);
  const tree = useMemo(() => buildObjectiveTree(objectives ?? []).sort((a, b) => (levelIndexById[a.cascadeLevelId] ?? 0) - (levelIndexById[b.cascadeLevelId] ?? 0)), [objectives, levelIndexById]);
  const mine = (objectives ?? []).filter((o) => o.ownerId === user?.id);
  const listRows = view === 'mine' ? mine : (objectives ?? []);
  const onCourse = (objectives ?? []).filter((o) => ['On Track', 'Achieved'].includes(o.status)).length;

  return (
    <div className="db">
      <div className="rp-head">
        <div>
          <h1 className="rp-title">{tPlural('Objective')}</h1>
          <p className="rp-sub">
            Every {t('Objective').toLowerCase()} in the organisation{activeCycle ? ` for ${activeCycle.name}` : ''}. You can edit your own and your direct reports&apos;.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {activeCycle && <div className="rp-cycle"><strong>{activeCycle.name}</strong>Closes {formatDate(activeCycle.endDate)}</div>}
          {canCreate && cascadeLevels.length > 0 && !showCreate && (
            <button type="button" onClick={() => setShowCreate(true)} className="ob-btn ob-btn-primary">New {t('Objective').toLowerCase()}</button>
          )}
        </div>
      </div>

      {canCreate && cascadeLevels.length === 0 && objectives !== null && (
        <div className="ob-note-warn" style={{ marginBottom: 16 }}>
          No cascade levels are configured yet. Ask a Tenant Administrator to set them up under OKR Settings first.
        </div>
      )}

      {showCreate && (
        <CreateObjectiveForm
          cascadeLevels={cascadeLevels} objectives={objectives ?? []}
          onCreated={() => { setShowCreate(false); load(); }} onCancel={() => setShowCreate(false)} t={t}
        />
      )}

      {error && <div className="ob-error" style={{ marginBottom: 16 }}>{error}</div>}
      {objectives === null && !error && <div className="db-skeleton" style={{ height: 200 }} aria-label="Loading" />}
      {objectives && objectives.length === 0 && (
        <div className="db-empty">No {tPlural('Objective').toLowerCase()} yet{activeCycle ? ` in ${activeCycle.name}` : ''}.</div>
      )}

      {objectives && objectives.length > 0 && (
        <>
          <div className="db-glance ob-glance">
            <section className="vz-panel">
              <h2 className="vz-panel-title">All {tPlural('Objective').toLowerCase()}</h2>
              <p className="vz-panel-note">Status across the organisation</p>
              <StatusRing items={objectives} noun={tPlural('Objective').toLowerCase()}
                headline={{ figure: `${onCourse}/${objectives.length}`, caption: 'on track or achieved' }} />
            </section>
            <section className="vz-panel">
              <h2 className="vz-panel-title">By level</h2>
              <p className="vz-panel-note">How many at each level of the cascade, and how they stand</p>
              <div className="am-levels">
                {[...cascadeLevels].sort((a, b) => a.level_index - b.level_index).map((l) => {
                  const items = objectives.filter((o) => o.cascadeLevelId === l.id);
                  const counts = new Map();
                  for (const o of items) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
                  return (
                    <div key={l.id} className="am-level" style={{ gridTemplateColumns: '110px 1fr 28px' }}>
                      <span className="am-level-name">{l.label}</span>
                      <span className="db-bar">
                        {[...counts.entries()].map(([st, n]) => (
                          <span key={st} title={`${n} ${st}`} style={{ width: `${(n / items.length) * 100}%`, background: statusColor(st) }} />
                        ))}
                      </span>
                      <span className="am-level-count">{items.length}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="ob-toolbar">
            <div className="ob-toggle" role="tablist">
              {[['hierarchy', 'Hierarchy'], ['list', 'List'], ['mine', `Mine (${mine.length})`]].map(([v, label]) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{label}</button>
              ))}
            </div>
            <Link className="db-link" to="/reports/alignment-map">See it as a map</Link>
          </div>

          {view === 'hierarchy' ? (
            <div className="ob-tree">
              {tree.map((root) => <TreeNode key={root.id} node={root} depth={0} levelLabelById={levelLabelById} />)}
            </div>
          ) : (
            <div className="ob-tree">
              {listRows.length === 0 && <div className="ob-node"><span /><span className="db-section-note">You don&apos;t own any {tPlural('Objective').toLowerCase()} this {t('Cycle').toLowerCase()}.</span></div>}
              {listRows.map((o) => (
                <div key={o.id} className="ob-node">
                  <span className="ob-node-spacer" />
                  <span className="ob-node-main">
                    <span className="ob-node-level">{levelLabelById[o.cascadeLevelId] ?? ''}</span>
                    <Link to={`/objectives/${o.id}`} className="ob-node-title">{o.title}</Link>
                    <Coverage reporting={o.inputsReporting} total={o.inputsTotal} variant="compact" />
                  </span>
                  <span className="ob-node-owner">
                    <Avatar firstName={o.ownerFirstName} lastName={o.ownerLastName} size={22} />
                    <span>{o.ownerFirstName} {o.ownerLastName}</span>
                  </span>
                  <StatusText status={o.status} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CreateObjectiveForm({ cascadeLevels, objectives, onCreated, onCancel, t }) {
  const sortedLevels = useMemo(() => [...cascadeLevels].sort((a, b) => a.level_index - b.level_index), [cascadeLevels]);
  const [title, setTitle] = useState('');
  const [cascadeLevelId, setCascadeLevelId] = useState(sortedLevels[0]?.id ?? '');
  const [parentObjectiveId, setParentObjectiveId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // A valid parent must sit exactly one cascade level above the selected level (FR-015).
  const selectedLevel = cascadeLevels.find((l) => l.id === cascadeLevelId);
  const validParents = selectedLevel
    ? objectives.filter((o) => cascadeLevels.find((l) => l.id === o.cascadeLevelId)?.level_index === selectedLevel.level_index - 1)
    : [];

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await objectivesApi.create({
        title,
        cascadeLevelId,
        parentObjectiveId: parentObjectiveId || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err.message ?? 'Failed to create Objective');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ob-panel" style={{ marginBottom: 20 }}>
      <h2 className="ob-panel-title">New {t('Objective').toLowerCase()}</h2>
      <div className="ob-form" style={{ maxWidth: 560 }}>
        <label className="ob-field">
          <span>Title</span>
          <input required style={s.formInput} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Grow net revenue by 20%" />
        </label>
        <label className="ob-field">
          <span>Cascade level</span>
          <select style={s.select} value={cascadeLevelId} onChange={(e) => { setCascadeLevelId(e.target.value); setParentObjectiveId(''); }}>
            {sortedLevels.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
        {validParents.length > 0 && (
          <label className="ob-field">
            <span>Rolls up into (optional)</span>
            <select style={s.select} value={parentObjectiveId} onChange={(e) => setParentObjectiveId(e.target.value)}>
              <option value="">Nothing above it for now</option>
              {validParents.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
            <span className="ob-hint">You can link it later from the {t('Objective').toLowerCase()} itself.</span>
          </label>
        )}
        {error && <div className="ob-error">{error}</div>}
        <div className="ob-form-row">
          <button type="submit" disabled={submitting} className="ob-btn ob-btn-primary">{submitting ? 'Creating…' : `Create ${t('Objective').toLowerCase()}`}</button>
          <button type="button" onClick={onCancel} className="ob-btn ob-btn-quiet">Cancel</button>
        </div>
      </div>
    </form>
  );
}
