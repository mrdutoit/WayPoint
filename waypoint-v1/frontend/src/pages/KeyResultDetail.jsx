import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { useTerms } from '../context/TerminologyContext.jsx';
import { keyResultsApi, initiativesApi, rubricApi } from '../services/api.js';
import SubmitCheckInForm, { CONFIDENCE_LABELS } from '../components/SubmitCheckInForm.jsx';
import { s, colors, STATUS_META } from '../styles/tokens.js';
import DatePicker from '../components/DatePicker.jsx';

function StatusChip({ status }) {
  const meta = STATUS_META[status] ?? { color: colors.ink500, bg: colors.ink100 };
  return <span style={s.chip(meta.color, meta.bg)}>{status}</span>;
}

const INITIATIVE_STATUSES = ['Not Started', 'In Progress', 'Done'];

export default function KeyResultDetail() {
  const { id } = useParams();
  const { isMobile } = useWindowSize();
  const { t, tPlural } = useTerms();
  const pageStyle = isMobile ? s.pageMobile : s.page;

  const [keyResult, setKeyResult] = useState(null);
  const [rubric, setRubric] = useState(null);
  const [checkIns, setCheckIns] = useState([]);
  const [checkInsRestricted, setCheckInsRestricted] = useState(false);
  const [initiatives, setInitiatives] = useState([]);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  function load() {
    return Promise.all([keyResultsApi.get(id), rubricApi.get(), keyResultsApi.listInitiatives(id)])
      .then(([krResult, rubricResult, initiativesResult]) => {
        setKeyResult(krResult.keyResult);
        setRubric(rubricResult.rubric ?? null);
        setInitiatives(initiativesResult.initiatives ?? []);
      })
      .then(() =>
        // Fetched separately — Check-in comments/confidence stay
        // restricted to owner/Manager/TenantAdmin even though the Key
        // Result itself is now tenant-wide readable (see
        // checkInService.js's module comment), so this can 403 for a
        // viewer who can otherwise see the rest of the page fine.
        keyResultsApi.listCheckIns(id)
          .then((result) => setCheckIns(result.checkIns ?? []))
          .catch((err) => {
            if (err.status === 403) setCheckInsRestricted(true);
          })
      )
      .catch((err) => {
        if (err.status === 404) setNotFound(true);
        else if (err.status === 403) setForbidden(true);
        else setError(err.message ?? `Failed to load this ${t('KeyResult')}`);
      });
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (notFound) return <div style={pageStyle}><p style={{ color: colors.ink500 }}>{t('KeyResult')} not found.</p></div>;
  if (forbidden) return <div style={pageStyle}><p style={{ color: colors.ink500 }}>You don't have access to this {t('KeyResult').toLowerCase()}.</p></div>;
  if (error) return <div style={pageStyle}><div style={s.chip(colors.danger, colors.dangerBg)}>{error}</div></div>;
  if (!keyResult) return <div style={pageStyle}><p style={{ fontSize: 13, color: colors.ink500 }}>Loading…</p></div>;

  return (
    <div style={pageStyle}>
      <Link to={`/objectives/${keyResult.objectiveId}`} style={{ fontSize: 13, color: colors.brand600, textDecoration: 'none' }}>
        &larr; Back to {t('Objective')}
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.ink900 }}>{keyResult.title}</h1>
        <StatusChip status={keyResult.status} />
      </div>
      <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 24 }}>
        Weighting {Number(keyResult.weighting)} — status is computed automatically from the most recent {t('CheckIn').toLowerCase()} (FR-004).
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={s.card}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: colors.ink900 }}>{tPlural('CheckIn')}</div>

          {checkInsRestricted ? (
            <div style={{ fontSize: 13, color: colors.ink500 }}>
              {tPlural('CheckIn')} are only visible to the owner, their Manager, and Tenant Administrators.
            </div>
          ) : (
            <>
              {keyResult.canEdit && (
                rubric ? (
                  <SubmitCheckInForm keyResultId={id} rubric={rubric} label={t('CheckIn')} onCreated={() => load()} />
                ) : (
                  <div style={{ ...s.chip(colors.warn, colors.warnBg), marginBottom: 16 }}>
                    No Scoring Rubric configured for this tenant yet — ask a Tenant Administrator to set one up under OKR Settings.
                  </div>
                )
              )}

              {checkIns.length === 0 ? (
                <div style={{ fontSize: 13, color: colors.ink500, marginTop: 12 }}>No {tPlural('CheckIn').toLowerCase()} yet.</div>
              ) : (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {checkIns.map((ci) => <CheckInRow key={ci.id} checkIn={ci} rubric={rubric} />)}
                </div>
              )}
            </>
          )}
        </div>

        <div style={s.card}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: colors.ink900 }}>{tPlural('Initiative')}</div>

          {initiatives.length === 0 && (
            <div style={{ fontSize: 13, color: colors.ink500, marginBottom: 16 }}>No {tPlural('Initiative').toLowerCase()} yet.</div>
          )}
          {initiatives.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {initiatives.map((init) => (
                <InitiativeRow key={init.id} initiative={init} canEdit={keyResult.canEdit} onSaved={(updated) => {
                  setInitiatives((prev) => prev.map((i) => (i.id === init.id ? { ...i, ...updated } : i)));
                }} />
              ))}
            </div>
          )}

          {keyResult.canEdit && (
            <AddInitiativeForm keyResultId={id} label={t('Initiative')} onCreated={(init) => setInitiatives((prev) => [...prev, init])} />
          )}
        </div>
      </div>
    </div>
  );
}

function CheckInRow({ checkIn, rubric }) {
  const level = rubric?.levels.find((l) => l.id === checkIn.rubricLevelId);
  return (
    <div style={{ padding: 10, borderRadius: 8, border: `1px solid ${colors.line}` }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <StatusChip status={level?.label ?? 'Unknown'} />
        <span style={{ fontSize: 12, color: colors.ink500 }}>Confidence: {checkIn.confidence}/5</span>
        <span style={{ fontSize: 12, color: colors.ink400 }}>{new Date(checkIn.submittedAt).toLocaleString()}</span>
      </div>
      {checkIn.comment && <div style={{ fontSize: 13, color: colors.ink700, marginTop: 6 }}>{checkIn.comment}</div>}
    </div>
  );
}

function InitiativeRow({ initiative, canEdit, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleStatusChange(e) {
    const nextStatus = e.target.value;
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

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: 10, borderRadius: 8, border: `1px solid ${colors.line}` }}>
      <span style={{ fontSize: 13, color: colors.ink900, flex: '1 1 200px' }}>{initiative.title}</span>
      {initiative.dueDate && <span style={{ fontSize: 12, color: colors.ink500 }}>Due {initiative.dueDate}</span>}
      {canEdit ? (
        <select value={initiative.status} onChange={handleStatusChange} disabled={saving} style={{ ...s.select, width: 140 }}>
          {INITIATIVE_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
        </select>
      ) : (
        <span style={s.chip(colors.ink500, colors.ink100)}>{initiative.status}</span>
      )}
      {error && <span style={s.chip(colors.danger, colors.dangerBg)}>{error}</span>}
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
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ flex: '1 1 240px' }}>
        <label style={s.label}>New {label}</label>
        <input required style={s.formInput} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Launch referral programme" />
      </div>
      <div style={{ width: 160 }}>
        <label style={s.label}>Due date (optional)</label>
        <DatePicker value={dueDate} onChange={setDueDate} />
      </div>
      <button type="submit" disabled={submitting} style={s.btnPrimary}>{submitting ? 'Adding…' : 'Add'}</button>
      {error && <div style={s.chip(colors.danger, colors.dangerBg)}>{error}</div>}
    </form>
  );
}
