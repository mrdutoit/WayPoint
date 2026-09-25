import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useTerms } from '../context/TerminologyContext.jsx';
import { objectivesApi, keyResultsApi, cascadeLevelsApi, rubricApi, cyclesApi } from '../services/api.js';
import { s } from '../styles/tokens.js';
import SubmitCheckInForm from '../components/SubmitCheckInForm.jsx';
import { Avatar } from '../components/Avatar.jsx';
import CourseLine from '../components/viz/CourseLine.jsx';
import WeightMap from '../components/viz/WeightMap.jsx';
import ConfidenceTrail from '../components/viz/ConfidenceTrail.jsx';
import { StatusText, statusColor, formatStamp } from '../components/viz/Tooltip.jsx';
import { cycleProgress, daysSince, relativeDays, STALE_AFTER_DAYS } from '../utils/cycleMath.js';
import './dashboard.css';
import './reports.css';
import './objectives.css';

/*
 * Objective Detail — 2026-09-24 redesign. The page every chart links to.
 *
 * Navy hero: level, owner, title, status, and this Objective's own course
 * line (every Check-in on its Key Results, detail on hover). "Where it
 * sits": what it rolls up into and what rolls up into it. Then the Key
 * Results as rows — share of score (with the weight map above them),
 * confidence trail, last check-in, status — each with an inline Check-in
 * drawer and inline edit; then Reflections.
 *
 * Behaviour is unchanged from before: same endpoints, same edit rules
 * (see EditObjectiveForm), same ?checkin=<keyResultId> deep link, and the
 * same graceful handling where Check-ins or Reflections are restricted
 * to owner/Manager/TenantAdmin — the page still renders, just without
 * that detail. Check-ins are fetched per Key Result (the same call Key
 * Result Detail makes); an Objective has a handful, not dozens.
 */

export default function ObjectiveDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const autoCheckInId = searchParams.get('checkin');
  const { t, tPlural } = useTerms();
  const [objective, setObjective] = useState(null);
  const [keyResults, setKeyResults] = useState([]);
  const [checkInsByKr, setCheckInsByKr] = useState({});
  const [checkInsRestricted, setCheckInsRestricted] = useState(false);
  const [reflections, setReflections] = useState([]);
  const [reflectionsRestricted, setReflectionsRestricted] = useState(false);
  const [cascadeLevels, setCascadeLevels] = useState([]);
  const [allObjectives, setAllObjectives] = useState([]);
  const [rubric, setRubric] = useState(null);
  const [cycles, setCycles] = useState([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  function loadCheckIns(krs, levels) {
    const labelOf = new Map((levels ?? []).map((l) => [l.id, l.label]));
    return Promise.all(krs.map((kr) =>
      keyResultsApi.listCheckIns(kr.id)
        .then((r) => [kr.id, (r.checkIns ?? []).map((ci) => ({
          ...ci,
          scoreLabel: labelOf.get(ci.rubricLevelId) ?? 'Unknown',
          submittedByName: [ci.submittedByFirstName, ci.submittedByLastName].filter(Boolean).join(' '),
        })).sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt))])
        .catch((err) => { if (err.status === 403) setCheckInsRestricted(true); return [kr.id, []]; })
    )).then((pairs) => setCheckInsByKr(Object.fromEntries(pairs)));
  }

  function load() {
    return Promise.all([
      objectivesApi.get(id),
      cascadeLevelsApi.list().catch(() => ({ levels: [] })),
      objectivesApi.list().catch(() => ({ objectives: [] })),
      rubricApi.get().catch(() => ({ rubric: null })),
      cyclesApi.list().catch(() => ({ cycles: [] })),
    ])
      .then(([result, levelResult, objResult, rubricResult, cycleResult]) => {
        const krs = result.keyResults ?? [];
        setObjective(result.objective);
        setKeyResults(krs);
        setCascadeLevels(levelResult?.levels ?? []);
        setAllObjectives(objResult?.objectives ?? []);
        setRubric(rubricResult?.rubric ?? null);
        setCycles(cycleResult?.cycles ?? []);
        return loadCheckIns(krs, rubricResult?.rubric?.levels);
      })
      .then(() =>
        objectivesApi.listReflections(id)
          .then((r) => setReflections(r.reflections ?? []))
          .catch((err) => { if (err.status === 403) setReflectionsRestricted(true); })
      )
      .catch((err) => {
        if (err.status === 404) setNotFound(true);
        else if (err.status === 403) setForbidden(true);
        else setError(err.message ?? 'Failed to load this Objective');
      });
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arriving from a Dashboard "Add check-in" button: bring that Key
  // Result's (already open) check-in drawer into view once rendered.
  const loaded = Boolean(objective);
  useEffect(() => {
    if (!loaded || !autoCheckInId) return;
    const el = document.getElementById(`kr-${autoCheckInId}`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [loaded, autoCheckInId]);

  const levelById = useMemo(() => new Map(cascadeLevels.map((l) => [l.id, l])), [cascadeLevels]);

  if (notFound) return <div className="db"><div className="db-empty">{t('Objective')} not found.</div></div>;
  if (forbidden) return <div className="db"><div className="db-empty">You don&apos;t have access to this {t('Objective').toLowerCase()}.</div></div>;
  if (error) return <div className="db"><div className="db-empty">This {t('Objective').toLowerCase()} couldn&apos;t load ({error}).</div></div>;
  if (!objective) return <div className="db"><div className="db-skeleton" aria-label="Loading" /></div>;

  const self = allObjectives.find((o) => o.id === objective.id);
  const level = levelById.get(objective.cascadeLevelId);
  const parent = allObjectives.find((o) => o.id === objective.parentObjectiveId);
  const children = allObjectives.filter((o) => o.parentObjectiveId === objective.id);
  const cycle = cycles.find((c) => c.id === objective.cycleId) ?? cycles.find((c) => c.status === 'Active');
  const progress = cycle ? cycleProgress(cycle.startDate, cycle.endDate) : null;
  const allCheckIns = keyResults.flatMap((kr) => (checkInsByKr[kr.id] ?? []).map((ci) => ({ ...ci, keyResultTitle: kr.title })));
  const lastCheckIn = keyResults.map((kr) => kr.lastCheckInAt).filter(Boolean).sort().at(-1);
  const totalWeight = keyResults.reduce((sum, kr) => sum + Math.max(Number(kr.weighting) || 0, 0), 0);
  const krWord = (n) => (n === 1 ? t('KeyResult') : tPlural('KeyResult')).toLowerCase();
  const neverChecked = keyResults.filter((kr) => !kr.lastCheckInAt).length;

  return (
    <div className="db">
      <Link to="/objectives" className="db-link">&larr; {tPlural('Objective')}</Link>

      <section className="db-hero" data-theme="dark" style={{ marginTop: 14 }}>
        <div className="db-hero-top">
          <div style={{ minWidth: 0, flex: '1 1 480px' }}>
            <div className="ob-hero-meta">
              {level && <span className="ob-level-tag">{level.label}</span>}
              {self && (
                <span className="ob-owner">
                  <Avatar firstName={self.ownerFirstName} lastName={self.ownerLastName} size={22} />
                  {self.ownerFirstName} {self.ownerLastName}
                </span>
              )}
            </div>
            <h1 className="db-day db-display ob-title">{objective.title}</h1>
            <div className="ob-hero-status">
              <StatusText status={objective.status} />
              {objective.canEdit && !editing && (
                <button type="button" className="ob-btn ob-btn-ghost ob-btn-sm" onClick={() => setEditing(true)}>Edit</button>
              )}
            </div>
          </div>
          {cycle && (
            <div className="db-cycle-meta">
              <span className="db-cycle-name">{cycle.name}</span>
              {progress && `Day ${progress.dayNumber} of ${progress.totalDays}`}
            </div>
          )}
        </div>
        <p className="db-summary">
          {keyResults.length === 0
            ? <>No {tPlural('KeyResult').toLowerCase()} yet, so there&apos;s nothing to score.</>
            : <>
                <strong>{keyResults.length}</strong> {krWord(keyResults.length)}
                {children.length > 0 && <> and <strong>{children.length}</strong> linked {(children.length === 1 ? t('Objective') : tPlural('Objective')).toLowerCase()}</>} feed this status.
                {' '}Last {t('CheckIn').toLowerCase()} {relativeDays(daysSince(lastCheckIn)).toLowerCase()}
                {neverChecked > 0 && <>; <strong>{neverChecked}</strong> {krWord(neverChecked)} never checked in</>}.
                {' '}Status is calculated from {tPlural('CheckIn').toLowerCase()}, never set by hand.
              </>}
        </p>
        {progress && keyResults.length > 0 && (
          checkInsRestricted
            ? <p className="db-summary" style={{ fontSize: 13, color: 'var(--ink500)' }}>{tPlural('CheckIn')} detail is visible to the owner, their Manager and Tenant Administrators.</p>
            : <CourseLine cycle={cycle} progress={progress} checkIns={allCheckIns} whose="this objective's" />
        )}
      </section>

      {editing && (
        <EditObjectiveForm
          objective={objective} cascadeLevels={cascadeLevels} allObjectives={allObjectives}
          onSaved={(updated) => { setObjective((prev) => ({ ...prev, ...updated })); load(); }}
          onClose={() => setEditing(false)} label={t('Objective')}
        />
      )}

      <section className="rp-section" style={{ marginTop: 32 }}>
        <div className="db-section-head">
          <h2 className="db-section-title db-display">Where it sits</h2>
          <Link className="db-link" to="/reports/alignment-map">Alignment map</Link>
        </div>
        <div className="ob-lineage">
          <div className="ob-lineage-col">
            <span className="ob-lineage-label">Rolls up into</span>
            {parent ? <MiniObjective o={parent} levelById={levelById} /> : <span className="ob-mini-empty">Nothing above it{level?.level_index > 1 ? ', not linked yet' : ''}</span>}
          </div>
          <span className="ob-lineage-arrow" aria-hidden="true">&larr;</span>
          <div className="ob-lineage-col">
            <span className="ob-lineage-label">This {t('Objective').toLowerCase()}</span>
            <div className="ob-mini self" style={{ '--status': statusColor(objective.status) }}>
              <span className="ob-mini-title">{objective.title}</span>
              <span className="ob-mini-sub">{objective.status}</span>
            </div>
          </div>
          <span className="ob-lineage-arrow" aria-hidden="true">&larr;</span>
          <div className="ob-lineage-col">
            <span className="ob-lineage-label">Fed by {children.length || 'no'} linked {(children.length === 1 ? t('Objective') : tPlural('Objective')).toLowerCase()}</span>
            {children.length ? children.slice(0, 4).map((c) => <MiniObjective key={c.id} o={c} levelById={levelById} />) : <span className="ob-mini-empty">Nothing below it yet</span>}
            {children.length > 4 && <span className="db-section-note">and {children.length - 4} more</span>}
          </div>
        </div>
      </section>

      <section className="rp-section">
        <div className="db-section-head">
          <h2 className="db-section-title db-display">{tPlural('KeyResult')}</h2>
          <span className="db-section-note">Size is each one&apos;s share of the score</span>
        </div>
        {keyResults.length > 0 && <div style={{ marginBottom: 14 }}><WeightMap keyResults={keyResults.map((kr) => ({ ...kr, checkInHistory: checkInsByKr[kr.id] ?? [] }))} height={150} /></div>}
        <div className="ob-krs">
          {keyResults.length === 0 && <div className="ob-kr"><span className="db-section-note">No {tPlural('KeyResult').toLowerCase()} yet.</span></div>}
          {keyResults.map((kr) => (
            <KeyResultRow
              key={kr.id} keyResult={kr} canEdit={objective.canEdit} rubric={rubric} label={t('CheckIn')}
              checkIns={checkInsByKr[kr.id] ?? []}
              share={totalWeight > 0 ? Math.round((Math.max(Number(kr.weighting) || 0, 0) / totalWeight) * 100) : 0}
              autoOpen={autoCheckInId === kr.id}
              onSaved={(updated) => setKeyResults((prev) => prev.map((k) => (k.id === kr.id ? { ...k, ...updated } : k)))}
              onCheckInCreated={load}
            />
          ))}
          {objective.canEdit && (
            <div className="ob-add">
              <AddKeyResultForm objectiveId={objective.id} onCreated={(kr) => setKeyResults((prev) => [...prev, kr])} label={t('KeyResult')} />
            </div>
          )}
        </div>
      </section>

      <section className="rp-section">
        <div className="db-section-head">
          <h2 className="db-section-title db-display">{tPlural('Reflection')}</h2>
          <span className="db-section-note">Lessons captured, typically at {t('Cycle').toLowerCase()} close</span>
        </div>
        {reflectionsRestricted ? (
          <div className="db-empty">{tPlural('Reflection')} are only visible to the owner, their Manager and Tenant Administrators.</div>
        ) : (
          <div className={objective.canEdit ? 'ob-two' : ''}>
            <div className="ob-panel">
              {reflections.length === 0
                ? <p className="db-section-note" style={{ margin: 0 }}>No {tPlural('Reflection').toLowerCase()} yet.</p>
                : reflections.map((r) => (
                    <article key={r.id} className="ob-reflection">
                      <div className="ob-reflection-when">{formatStamp(r.submittedAt)}</div>
                      <p className="ob-reflection-body">{r.content}</p>
                    </article>
                  ))}
            </div>
            {objective.canEdit && (
              <div className="ob-panel">
                <AddReflectionForm objectiveId={objective.id} label={t('Reflection')} onCreated={(r) => setReflections((prev) => [r, ...prev])} />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function MiniObjective({ o, levelById }) {
  return (
    <Link to={`/objectives/${o.id}`} className="ob-mini" style={{ '--status': statusColor(o.status) }}>
      <span className="ob-mini-title">{o.title}</span>
      <span className="ob-mini-sub">{levelById.get(o.cascadeLevelId)?.label ?? ''}{o.ownerFirstName ? `, ${o.ownerFirstName} ${o.ownerLastName}` : ''}. {o.status}</span>
    </Link>
  );
}

function KeyResultRow({ keyResult, checkIns, share, canEdit, rubric, label, autoOpen = false, onSaved, onCheckInCreated }) {
  const [editing, setEditing] = useState(false);
  const [checkingIn, setCheckingIn] = useState(Boolean(autoOpen && canEdit));
  const [title, setTitle] = useState(keyResult.title);
  const [weighting, setWeighting] = useState(String(keyResult.weighting));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const result = await keyResultsApi.update(keyResult.id, { title, weighting: Number(weighting) });
      onSaved(result.keyResult);
      setEditing(false);
    } catch (err) {
      setError(err.message ?? 'Failed to update Key Result');
    } finally {
      setSaving(false);
    }
  }

  const age = keyResult.lastCheckInAt ? daysSince(keyResult.lastCheckInAt) : null;

  if (editing) {
    return (
      <div className="ob-kr">
        <div className="ob-form-row">
          <label className="ob-field" style={{ flex: '1 1 280px' }}>
            <span>Title</span>
            <input style={s.formInput} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="ob-field" style={{ width: 110 }}>
            <span>Weighting</span>
            <input style={s.formInput} type="number" step="0.01" min="0.01" value={weighting} onChange={(e) => setWeighting(e.target.value)} />
          </label>
          <button type="button" onClick={handleSave} disabled={saving} className="ob-btn ob-btn-primary">{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={() => setEditing(false)} className="ob-btn ob-btn-quiet">Cancel</button>
        </div>
        {error && <div className="ob-error" style={{ marginTop: 10 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div className="ob-kr" id={`kr-${keyResult.id}`}>
      <div className="ob-kr-row">
        <div>
          <Link to={`/key-results/${keyResult.id}`} className="ob-kr-title">{keyResult.title}</Link>
          <div className="ob-kr-meta">
            <span>{share}% of the score</span>
            <span className={age === null || age >= STALE_AFTER_DAYS ? 'due' : ''}>
              {age === null ? `No ${label.toLowerCase()}s yet` : `Last ${label.toLowerCase()} ${relativeDays(age).toLowerCase()}`}
            </span>
          </div>
        </div>
        <div className="ob-kr-trail">{checkIns.length > 0 && <ConfidenceTrail checkIns={checkIns} />}</div>
        <div className="ob-kr-status"><StatusText status={keyResult.status} /></div>
        <div className="ob-kr-actions">
          {canEdit && (
            <>
              <button type="button" className={`ob-btn ob-btn-sm ${checkingIn ? 'ob-btn-quiet' : 'ob-btn-ghost'}`} onClick={() => setCheckingIn((v) => !v)}>
                {checkingIn ? 'Close' : `Add ${label.toLowerCase()}`}
              </button>
              <button type="button" className="ob-btn ob-btn-quiet ob-btn-sm" onClick={() => setEditing(true)}>Edit</button>
            </>
          )}
        </div>
      </div>
      {checkingIn && (
        <div className="ob-kr-drawer">
          {rubric ? (
            <SubmitCheckInForm
              keyResultId={keyResult.id} rubric={rubric} label={label}
              onCreated={() => { setCheckingIn(false); onCheckInCreated(); }}
              onCancel={() => setCheckingIn(false)}
            />
          ) : (
            <div className="ob-note-warn">No scoring rubric is configured for this organisation yet. Ask a Tenant Administrator to set one up under OKR Settings.</div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Rename, re-parent, and — as of 2026-09-17, at Mark's direction — move
 * to a different cascade level. See updateObjective's module comment
 * (objectiveService.js) for the two rules that protect FR-015 when the
 * level changes: blocked while children are linked, and the parent link
 * auto-detaches if it no longer fits the newly-selected level.
 */
function EditObjectiveForm({ objective, cascadeLevels, allObjectives, onSaved, onClose, label }) {
  const [title, setTitle] = useState(objective.title);
  const [levelId, setLevelId] = useState(objective.cascadeLevelId);
  const [parentObjectiveId, setParentObjectiveId] = useState(objective.parentObjectiveId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const sortedLevels = [...cascadeLevels].sort((a, b) => a.level_index - b.level_index);
  const selectedLevel = cascadeLevels.find((l) => l.id === levelId);
  // Recomputed against whichever level is currently selected in the form,
  // not the Objective's original level — changing the dropdown above
  // should immediately re-filter which parents make sense below it.
  const validParents = selectedLevel
    ? allObjectives.filter((o) =>
        o.id !== objective.id
        && cascadeLevels.find((l) => l.id === o.cascadeLevelId)?.level_index === selectedLevel.level_index - 1
      )
    : [];
  const childTitles = allObjectives.filter((o) => o.parentObjectiveId === objective.id).map((o) => o.title);

  function handleLevelChange(newLevelId) {
    setLevelId(newLevelId);
    // The previously-selected parent may no longer sit one level above
    // the new selection — clear it rather than silently submit something
    // that no longer makes sense; the server would detach it anyway if
    // left unspecified, but making that visible in the form is clearer
    // than letting a stale-looking selection sit there.
    setParentObjectiveId('');
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // parentObjectiveId explicitly null (not omitted) so "No parent"
      // actually detaches — updateObjective treats an omitted field as
      // "leave unchanged" and only an explicit null as "clear it".
      const result = await objectivesApi.update(objective.id, {
        title, parentObjectiveId: parentObjectiveId || null, cascadeLevelId: levelId,
      });
      onSaved(result.objective);
      onClose();
    } catch (err) {
      setError(err.message ?? `Failed to update ${label}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ob-panel ob-edit-panel">
      <h2 className="ob-panel-title">Edit {label.toLowerCase()}</h2>
      <div className="ob-form" style={{ maxWidth: 560 }}>
        <label className="ob-field">
          <span>Title</span>
          <input style={s.formInput} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="ob-field">
          <span>Cascade level</span>
          <select style={s.select} value={levelId} onChange={(e) => handleLevelChange(e.target.value)}>
            {sortedLevels.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          {childTitles.length > 0 && (
            <span className="ob-hint" style={{ color: 'var(--warn)' }}>
              Linked to {childTitles.length} child {label.toLowerCase()}{childTitles.length === 1 ? '' : 's'} ({childTitles.join(', ')}). Changing the level is blocked until they&apos;re re-parented or detached.
            </span>
          )}
        </label>
        {validParents.length > 0 && (
          <label className="ob-field">
            <span>Rolls up into (optional)</span>
            <select style={s.select} value={parentObjectiveId} onChange={(e) => setParentObjectiveId(e.target.value)}>
              <option value="">Nothing above it</option>
              {validParents.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </label>
        )}
        <div className="ob-form-row">
          <button type="button" onClick={handleSave} disabled={saving} className="ob-btn ob-btn-primary">{saving ? 'Saving…' : 'Save changes'}</button>
          <button type="button" onClick={onClose} className="ob-btn ob-btn-quiet">Cancel</button>
        </div>
        {error && <div className="ob-error">{error}</div>}
      </div>
    </div>
  );
}

function AddKeyResultForm({ objectiveId, onCreated, label }) {
  const [title, setTitle] = useState('');
  const [weighting, setWeighting] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await objectivesApi.createKeyResult(objectiveId, { title, weighting: Number(weighting) });
      onCreated(result.keyResult);
      setTitle('');
      setWeighting('1');
    } catch (err) {
      setError(err.message ?? `Failed to add ${label}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ob-form-row">
      <label className="ob-field" style={{ flex: '1 1 280px' }}>
        <span>New {label.toLowerCase()}</span>
        <input required style={s.formInput} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sign 10 new enterprise clients" />
      </label>
      <label className="ob-field" style={{ width: 110 }}>
        <span>Weighting</span>
        <input required type="number" step="0.01" min="0.01" style={s.formInput} value={weighting} onChange={(e) => setWeighting(e.target.value)} />
      </label>
      <button type="submit" disabled={submitting} className="ob-btn ob-btn-ghost">{submitting ? 'Adding…' : 'Add'}</button>
      {error && <div className="ob-error" style={{ flexBasis: '100%' }}>{error}</div>}
    </form>
  );
}

function AddReflectionForm({ objectiveId, label, onCreated }) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await objectivesApi.createReflection(objectiveId, { content });
      onCreated(result.reflection);
      setContent('');
    } catch (err) {
      setError(err.message ?? `Failed to submit ${label.toLowerCase()}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ob-form">
      <label className="ob-field">
        <span>New {label.toLowerCase()}</span>
        <textarea
          required style={{ ...s.formInput, minHeight: 90, resize: 'vertical' }}
          value={content} onChange={(e) => setContent(e.target.value)}
          placeholder="What went well, what didn't, what would we do differently?"
        />
      </label>
      <div>
        <button type="submit" disabled={submitting} className="ob-btn ob-btn-ghost">{submitting ? 'Submitting…' : `Submit ${label.toLowerCase()}`}</button>
      </div>
      {error && <div className="ob-error">{error}</div>}
    </form>
  );
}
