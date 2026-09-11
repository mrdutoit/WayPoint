import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { useTerms } from '../context/TerminologyContext.jsx';
import { objectivesApi, keyResultsApi } from '../services/api.js';
import { s, colors, STATUS_META } from '../styles/tokens.js';

function StatusChip({ status }) {
  const meta = STATUS_META[status] ?? { color: colors.ink500, bg: colors.ink100 };
  return <span style={s.chip(meta.color, meta.bg)}>{status}</span>;
}

export default function ObjectiveDetail() {
  const { id } = useParams();
  const { isMobile } = useWindowSize();
  const { t, tPlural } = useTerms();
  const pageStyle = isMobile ? s.pageMobile : s.page;
  const [objective, setObjective] = useState(null);
  const [keyResults, setKeyResults] = useState([]);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  function load() {
    return objectivesApi.get(id)
      .then((result) => {
        setObjective(result.objective);
        setKeyResults(result.keyResults ?? []);
      })
      .catch((err) => {
        if (err.status === 404) setNotFound(true);
        else if (err.status === 403) setForbidden(true);
        else setError(err.message ?? 'Failed to load this Objective');
      });
  }
  useEffect(() => { load(); }, [id]);

  if (notFound) {
    return <div style={pageStyle}><p style={{ color: colors.ink500 }}>{t('Objective')} not found.</p></div>;
  }
  if (forbidden) {
    return <div style={pageStyle}><p style={{ color: colors.ink500 }}>You don't have access to this {t('Objective').toLowerCase()} (FR-020: visible to its owner and their direct Manager only).</p></div>;
  }
  if (error) {
    return <div style={pageStyle}><div style={s.chip(colors.danger, colors.dangerBg)}>{error}</div></div>;
  }
  if (!objective) {
    return <div style={pageStyle}><p style={{ fontSize: 13, color: colors.ink500 }}>Loading…</p></div>;
  }

  return (
    <div style={pageStyle}>
      <Link to="/objectives" style={{ fontSize: 13, color: colors.brand600, textDecoration: 'none' }}>&larr; {tPlural('Objective')}</Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.ink900 }}>{objective.title}</h1>
        <StatusChip status={objective.status} />
      </div>
      <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 24 }}>
        Status is computed automatically from {t('KeyResult')} {t('CheckIn')}s (FR-004) — it can't be set directly.
      </p>

      <EditTitleForm objective={objective} onSaved={(updated) => setObjective((prev) => ({ ...prev, ...updated }))} label={t('Objective')} />

      <div style={{ ...s.card, marginTop: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: colors.ink900 }}>{tPlural('KeyResult')}</div>

        {keyResults.length === 0 && (
          <div style={{ fontSize: 13, color: colors.ink500, marginBottom: 16 }}>No {tPlural('KeyResult').toLowerCase()} yet.</div>
        )}

        {keyResults.length > 0 && (
          <div style={{ ...s.tableCard, marginBottom: 16 }}>
            <table style={{ ...s.table, minWidth: 420 }}>
              <thead>
                <tr>
                  <th style={s.th}>Title</th>
                  <th style={s.th}>Weighting</th>
                  <th style={s.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {keyResults.map((kr) => (
                  <KeyResultRow key={kr.id} keyResult={kr} onSaved={(updated) => {
                    setKeyResults((prev) => prev.map((k) => (k.id === kr.id ? { ...k, ...updated } : k)));
                  }} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <AddKeyResultForm objectiveId={objective.id} onCreated={(kr) => setKeyResults((prev) => [...prev, kr])} label={t('KeyResult')} />
      </div>
    </div>
  );
}

function EditTitleForm({ objective, onSaved, label }) {
  const [title, setTitle] = useState(objective.title);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} style={{ ...s.btnSecondary, padding: '6px 10px', fontSize: 12 }}>
        Rename
      </button>
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const result = await objectivesApi.update(objective.id, { title });
      onSaved(result.objective);
      setEditing(false);
    } catch (err) {
      setError(err.message ?? `Failed to rename ${label}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input style={{ ...s.formInput, maxWidth: 360 }} value={title} onChange={(e) => setTitle(e.target.value)} />
      <button type="button" onClick={handleSave} disabled={saving} style={s.btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
      <button type="button" onClick={() => setEditing(false)} style={s.btnSecondary}>Cancel</button>
      {error && <span style={s.chip(colors.danger, colors.dangerBg)}>{error}</span>}
    </div>
  );
}

function KeyResultRow({ keyResult, onSaved }) {
  const [editing, setEditing] = useState(false);
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

  if (editing) {
    return (
      <tr>
        <td style={s.td}><input style={s.formInput} value={title} onChange={(e) => setTitle(e.target.value)} /></td>
        <td style={s.td}><input style={{ ...s.formInput, width: 80 }} type="number" step="0.01" min="0.01" value={weighting} onChange={(e) => setWeighting(e.target.value)} /></td>
        <td style={s.td}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button type="button" onClick={handleSave} disabled={saving} style={{ ...s.btnPrimary, padding: '6px 10px', fontSize: 12 }}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => setEditing(false)} style={{ ...s.btnSecondary, padding: '6px 10px', fontSize: 12 }}>Cancel</button>
          </div>
          {error && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginTop: 6 }}>{error}</div>}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td style={s.td}>{keyResult.title}</td>
      <td style={s.td}>{Number(keyResult.weighting)}</td>
      <td style={s.td}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StatusChip status={keyResult.status} />
          <button type="button" onClick={() => setEditing(true)} style={{ ...s.btnSecondary, padding: '4px 8px', fontSize: 12 }}>Edit</button>
        </div>
      </td>
    </tr>
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
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ flex: '1 1 260px' }}>
        <label style={s.label}>New {label}</label>
        <input required style={s.formInput} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sign 10 new enterprise clients" />
      </div>
      <div style={{ width: 100 }}>
        <label style={s.label}>Weighting</label>
        <input required type="number" step="0.01" min="0.01" style={s.formInput} value={weighting} onChange={(e) => setWeighting(e.target.value)} />
      </div>
      <button type="submit" disabled={submitting} style={s.btnPrimary}>{submitting ? 'Adding…' : 'Add'}</button>
      {error && <div style={s.chip(colors.danger, colors.dangerBg)}>{error}</div>}
    </form>
  );
}
