import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import { useTerms } from '../context/TerminologyContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { objectivesApi, cascadeLevelsApi } from '../services/api.js';
import { s, colors, STATUS_META } from '../styles/tokens.js';

function StatusChip({ status }) {
  const meta = STATUS_META[status] ?? { color: colors.ink500, bg: colors.ink100 };
  return <span style={s.chip(meta.color, meta.bg)}>{status}</span>;
}

export default function Objectives() {
  const { role } = useRole();
  const { t, tPlural } = useTerms();
  const { isMobile } = useWindowSize();
  const [objectives, setObjectives] = useState(null);
  const [cascadeLevels, setCascadeLevels] = useState([]);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const canCreate = role === 'Manager' || role === 'Employee';

  function load() {
    return Promise.all([objectivesApi.list(), cascadeLevelsApi.list()])
      .then(([objResult, levelResult]) => {
        setObjectives(objResult?.objectives ?? []);
        setCascadeLevels(levelResult?.levels ?? []);
      })
      .catch((err) => setError(err.message ?? 'Failed to load Objectives'));
  }
  useEffect(() => { load(); }, []);

  const levelLabelById = useMemo(() => {
    const map = {};
    for (const l of cascadeLevels) map[l.id] = l.label;
    return map;
  }, [cascadeLevels]);

  return (
    <div style={isMobile ? s.pageMobile : s.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.ink900 }}>{tPlural('Objective')}</h1>
        {canCreate && cascadeLevels.length > 0 && (
          <button type="button" onClick={() => setShowCreate((v) => !v)} style={s.btnPrimary}>
            {showCreate ? 'Cancel' : `New ${t('Objective')}`}
          </button>
        )}
      </div>
      <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 20 }}>
        {tPlural('Objective')} you own, and {tPlural('Objective').toLowerCase()} owned by your direct reports (FR-020).
      </p>

      {canCreate && cascadeLevels.length === 0 && objectives !== null && (
        <div style={{ ...s.chip(colors.warn, colors.warnBg), marginBottom: 16 }}>
          No Cascade Levels are configured yet — ask a Tenant Administrator to set them up under OKR Settings before creating {t('Objective').match(/^[aeiou]/i) ? 'an' : 'a'} {t('Objective').toLowerCase()}.
        </div>
      )}

      {showCreate && (
        <CreateObjectiveForm
          cascadeLevels={cascadeLevels}
          objectives={objectives ?? []}
          onCreated={() => { setShowCreate(false); load(); }}
          t={t}
        />
      )}

      {error && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginBottom: 16 }}>{error}</div>}
      {objectives === null && !error && <div style={{ fontSize: 13, color: colors.ink500 }}>Loading…</div>}
      {objectives && objectives.length === 0 && (
        <div style={{ fontSize: 13, color: colors.ink500 }}>No {tPlural('Objective').toLowerCase()} yet.</div>
      )}

      {objectives && objectives.length > 0 && (
        <div style={s.tableCard}>
          <table style={{ ...s.table, minWidth: 480 }}>
            <thead>
              <tr>
                <th style={s.th}>Title</th>
                <th style={s.th}>Cascade level</th>
                <th style={s.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {objectives.map((o) => (
                <tr key={o.id}>
                  <td style={s.td}>
                    <Link to={`/objectives/${o.id}`} style={{ color: colors.brand600, textDecoration: 'none', fontWeight: 600 }}>
                      {o.title}
                    </Link>
                  </td>
                  <td style={s.td}>{levelLabelById[o.cascadeLevelId] ?? '—'}</td>
                  <td style={s.td}><StatusChip status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateObjectiveForm({ cascadeLevels, objectives, onCreated, t }) {
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
    <form onSubmit={handleSubmit} style={{ ...s.card, marginBottom: 20 }}>
      <label style={s.label} htmlFor="objective-title">Title</label>
      <input
        id="objective-title" required style={{ ...s.formInput, marginBottom: 14 }}
        value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Grow net revenue by 20%"
      />

      <label style={s.label} htmlFor="objective-level">Cascade level</label>
      <select
        id="objective-level" style={{ ...s.select, marginBottom: 14 }}
        value={cascadeLevelId}
        onChange={(e) => { setCascadeLevelId(e.target.value); setParentObjectiveId(''); }}
      >
        {sortedLevels.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>

      {validParents.length > 0 && (
        <>
          <label style={s.label} htmlFor="objective-parent">Parent {t('Objective')} (optional)</label>
          <select
            id="objective-parent" style={{ ...s.select, marginBottom: 14 }}
            value={parentObjectiveId} onChange={(e) => setParentObjectiveId(e.target.value)}
          >
            <option value="">No parent</option>
            {validParents.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
        </>
      )}

      {error && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginBottom: 14 }}>{error}</div>}

      <button type="submit" disabled={submitting} style={s.btnPrimary}>
        {submitting ? 'Creating…' : `Create ${t('Objective')}`}
      </button>
    </form>
  );
}
