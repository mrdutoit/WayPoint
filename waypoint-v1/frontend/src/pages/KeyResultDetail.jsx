import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTerms } from '../context/TerminologyContext.jsx';
import { keyResultsApi, initiativesApi, rubricApi, objectivesApi, cyclesApi } from '../services/api.js';
import SubmitCheckInForm from '../components/SubmitCheckInForm.jsx';
import DatePicker from '../components/DatePicker.jsx';
import { s } from '../styles/tokens.js';
import CourseLine from '../components/viz/CourseLine.jsx';
import ConfidenceTrail from '../components/viz/ConfidenceTrail.jsx';
import { StatusText, ConfidencePips, statusColor, formatStamp } from '../components/viz/Tooltip.jsx';
import { cycleProgress, daysSince, relativeDays } from '../utils/cycleMath.js';
import { formatDate } from '../utils/dateFormat.js';
import './dashboard.css';
import './reports.css';
import './scorecard.css';
import './objectives.css';

/*
 * Key Result Detail — 2026-09-24 redesign. Navy hero with the Objective
 * it belongs to, its status and weighting, and its own course line;
 * then Check-ins (form + timeline with submitter) beside a confidence
 * panel; then Initiatives with a one-click status control instead of a
 * dropdown. Same endpoints and permission handling as before: Check-ins
 * stay restricted to owner/Manager/TenantAdmin, and the page still
 * renders for anyone else.
 */

const INITIATIVE_STATUSES = ['Not Started', 'In Progress', 'Done'];

export default function KeyResultDetail() {
  const { id } = useParams();
  const { t, tPlural } = useTerms();
  const [keyResult, setKeyResult] = useState(null);
  const [objective, setObjective] = useState(null);
  const [cycle, setCycle] = useState(null);
  const [rubric, setRubric] = useState(null);
  const [checkIns, setCheckIns] = useState([]);
  const [checkInsRestricted, setCheckInsRestricted] = useState(false);
  const [initiatives, setInitiatives] = useState([]);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  function load() {
    return Promise.all([keyResultsApi.get(id), rubricApi.get(), keyResultsApi.listInitiatives(id)])
      .then(async ([krResult, rubricResult, initiativesResult]) => {
        const kr = krResult.keyResult;
        setKeyResult(kr);
        setRubric(rubricResult.rubric ?? null);
        setInitiatives(initiativesResult.initiatives ?? []);
        const labelOf = new Map((rubricResult.rubric?.levels ?? []).map((l) => [l.id, l.label]));
        // Context only — a failure here never blocks the page.
        const [objResult, cycleResult] = await Promise.all([
          objectivesApi.get(kr.objectiveId).catch(() => null),
          cyclesApi.list().catch(() => ({ cycles: [] })),
        ]);
        const obj = objResult?.objective ?? null;
        setObjective(obj);
        const cycles = cycleResult?.cycles ?? [];
        setCycle(cycles.find((c) => c.id === obj?.cycleId) ?? cycles.find((c) => c.status === 'Active') ?? null);
        return keyResultsApi.listCheckIns(id)
          .then((result) => setCheckIns((result.checkIns ?? []).map((ci) => ({
            ...ci,
            scoreLabel: labelOf.get(ci.rubricLevelId) ?? 'Unknown',
            submittedByName: [ci.submittedByFirstName, ci.submittedByLastName].filter(Boolean).join(' '),
            keyResultTitle: kr.title,
            objectiveId: kr.objectiveId,
          })).sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt))))
          .catch((err) => { if (err.status === 403) setCheckInsRestricted(true); });
      })
      .catch((err) => {
        if (err.status === 404) setNotFound(true);
        else if (err.status === 403) setForbidden(true);
        else setError(err.message ?? `Failed to load this ${t('KeyResult')}`);
      });
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (notFound) return <div className="db"><div className="db-empty">{t('KeyResult')} not found.</div></div>;
  if (forbidden) return <div className="db"><div className="db-empty">You don&apos;t have access to this {t('KeyResult').toLowerCase()}.</div></div>;
  if (error) return <div className="db"><div className="db-empty">This {t('KeyResult').toLowerCase()} couldn&apos;t load ({error}).</div></div>;
  if (!keyResult) return <div className="db"><div className="db-skeleton" aria-label="Loading" /></div>;

  const progress = cycle ? cycleProgress(cycle.startDate, cycle.endDate) : null;
  const last = checkIns.at(-1);
  const first = checkIns[0];
  const drift = last && first && checkIns.length > 1 ? Number(last.confidence) - Number(first.confidence) : null;
  const doneInitiatives = initiatives.filter((i) => i.status === 'Done').length;

  return (
    <div className="db">
      <Link to={`/objectives/${keyResult.objectiveId}`} className="db-link">&larr; {objective?.title ?? `Back to ${t('Objective').toLowerCase()}`}</Link>

      <section className="db-hero" data-theme="dark" style={{ marginTop: 14 }}>
        <div className="db-hero-top">
          <div style={{ minWidth: 0, flex: '1 1 480px' }}>
            <div className="ob-hero-meta">
              <span className="ob-level-tag">{t('KeyResult')}</span>
              {objective && <span>of <Link to={`/objectives/${objective.id}`} style={{ color: 'var(--ink700)' }}>{objective.title}</Link></span>}
            </div>
            <h1 className="db-day db-display ob-title">{keyResult.title}</h1>
            <div className="ob-hero-status">
              <StatusText status={keyResult.status} />
              <span style={{ fontSize: 13, color: 'var(--ink500)' }}>Weighting {Number(keyResult.weighting)}</span>
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
          {checkInsRestricted
            ? <>{tPlural('CheckIn')} are only visible to the owner, their Manager and Tenant Administrators.</>
            : checkIns.length === 0
              ? <>No {tPlural('CheckIn').toLowerCase()} yet. Status reads Not Started until the first one.</>
              : <><strong>{checkIns.length}</strong> {(checkIns.length === 1 ? t('CheckIn') : tPlural('CheckIn')).toLowerCase()} so far, the latest {relativeDays(daysSince(last.submittedAt)).toLowerCase()}{last.submittedByName ? ` by ${last.submittedByName}` : ''}. Status always follows the most recent one.</>}
        </p>
        {progress && !checkInsRestricted && <CourseLine cycle={cycle} progress={progress} checkIns={checkIns} whose={`this ${t('KeyResult').toLowerCase()}'s`} />}
      </section>

      {!checkInsRestricted && (
        <section className="rp-section">
          <div className="db-section-head">
            <h2 className="db-section-title db-display">{tPlural('CheckIn')}</h2>
          </div>
          <div className="ob-two">
            <div className="ob-panel">
              {checkIns.length === 0
                ? <p className="db-section-note" style={{ margin: 0 }}>No {tPlural('CheckIn').toLowerCase()} yet.</p>
                : (
                  <ol className="sc-timeline" style={{ margin: 0 }}>
                    {checkIns.slice().reverse().map((ci) => (
                      <li key={ci.id}>
                        <span className="sc-timeline-dot" style={{ background: statusColor(ci.scoreLabel) }} />
                        <div className="sc-timeline-head">
                          <StatusText status={ci.scoreLabel} />
                          <ConfidencePips value={ci.confidence} />
                          <span className="sc-timeline-when">{formatStamp(ci.submittedAt)}{ci.submittedByName ? `, ${ci.submittedByName}` : ''}</span>
                        </div>
                        {ci.comment && <p className="sc-timeline-comment">{ci.comment}</p>}
                      </li>
                    ))}
                  </ol>
                )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {keyResult.canEdit && (
                <div className="ob-panel">
                  <h3 className="ob-panel-title">Add a {t('CheckIn').toLowerCase()}</h3>
                  {rubric
                    ? <SubmitCheckInForm keyResultId={id} rubric={rubric} label={t('CheckIn')} onCreated={() => load()} />
                    : <div className="ob-note-warn">No scoring rubric is configured yet. Ask a Tenant Administrator to set one up under OKR Settings.</div>}
                </div>
              )}
              {checkIns.length > 0 && (
                <div className="ob-panel">
                  <h3 className="ob-panel-title">Confidence</h3>
                  <ConfidenceTrail checkIns={checkIns} width={260} />
                  <p className="db-section-note" style={{ margin: '10px 0 0' }}>
                    Now {last.confidence}/5
                    {drift !== null && (drift === 0 ? ', unchanged since the first check-in' : `, ${drift > 0 ? 'up' : 'down'} ${Math.abs(drift)} since the first check-in`)}.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="rp-section">
        <div className="db-section-head">
          <h2 className="db-section-title db-display">{tPlural('Initiative')}</h2>
          {initiatives.length > 0 && <span className="db-section-note">{doneInitiatives} of {initiatives.length} done</span>}
        </div>
        <div className="ob-panel">
          {initiatives.length === 0 && <p className="db-section-note" style={{ margin: '0 0 4px' }}>No {tPlural('Initiative').toLowerCase()} yet: the concrete work behind this result.</p>}
          {initiatives.map((init) => (
            <InitiativeRow key={init.id} initiative={init} canEdit={keyResult.canEdit} onSaved={(updated) => {
              setInitiatives((prev) => prev.map((i) => (i.id === init.id ? { ...i, ...updated } : i)));
            }} />
          ))}
          {keyResult.canEdit && (
            <div style={{ borderTop: initiatives.length ? '1px dashed var(--line)' : 'none', marginTop: initiatives.length ? 12 : 8, paddingTop: initiatives.length ? 16 : 0 }}>
              <AddInitiativeForm keyResultId={id} label={t('Initiative')} onCreated={(init) => setInitiatives((prev) => [...prev, init])} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function InitiativeRow({ initiative, canEdit, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function setStatus(nextStatus) {
    if (nextStatus === initiative.status) return;
    setSaving(true);
    setError(null);
    try {
      const result = await initiativesApi.update(initiative.id, { status: nextStatus });
      onSaved(result.initiative);
    } catch (err) {
      setError(err.message ?? 'Failed to update status');
    } finally {
      setSaving(false);
    }
  }

  const overdue = initiative.dueDate && initiative.status !== 'Done' && new Date(`${String(initiative.dueDate).slice(0, 10)}T23:59:59`) < new Date();
  return (
    <div className="ob-init">
      <div>
        <div className="ob-init-title" style={initiative.status === 'Done' ? { textDecoration: 'line-through', color: 'var(--ink500)' } : undefined}>{initiative.title}</div>
        {initiative.dueDate && (
          <div className="ob-init-sub" style={overdue ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>
            {overdue ? 'Overdue, was due' : 'Due'} {formatDate(String(initiative.dueDate).slice(0, 10))}
          </div>
        )}
      </div>
      {canEdit ? (
        <div className="ob-seg" role="radiogroup" aria-label="Status">
          {INITIATIVE_STATUSES.map((st) => (
            <button key={st} type="button" role="radio" aria-checked={initiative.status === st}
              className={initiative.status === st ? 'on' : ''} disabled={saving} onClick={() => setStatus(st)}>{st}</button>
          ))}
        </div>
      ) : <span className="db-section-note">{initiative.status}</span>}
      {error ? <span className="ob-error">{error}</span> : <span />}
    </div>
  );
}

function AddInitiativeForm({ keyResultId, label, onCreated }) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await keyResultsApi.createInitiative(keyResultId, { title, dueDate: dueDate || undefined });
      onCreated(result.initiative);
      setTitle('');
      setDueDate('');
    } catch (err) {
      setError(err.message ?? `Failed to add ${label.toLowerCase()}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ob-form-row">
      <label className="ob-field" style={{ flex: '1 1 260px' }}>
        <span>New {label.toLowerCase()}</span>
        <input required style={s.formInput} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Launch the referral programme" />
      </label>
      <div className="ob-field" style={{ width: 170 }}>
        <span>Due date (optional)</span>
        <DatePicker value={dueDate} onChange={setDueDate} />
      </div>
      <button type="submit" disabled={submitting} className="ob-btn ob-btn-ghost">{submitting ? 'Adding…' : 'Add'}</button>
      {error && <div className="ob-error" style={{ flexBasis: '100%' }}>{error}</div>}
    </form>
  );
}
