import { useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { useTerms } from '../context/TerminologyContext.jsx';
import { objectivesApi, keyResultsApi, cascadeLevelsApi, rubricApi } from '../services/api.js';
import { s, colors, STATUS_META } from '../styles/tokens.js';
import SubmitCheckInForm from '../components/SubmitCheckInForm.jsx';

function StatusChip({ status }) {
  const meta = STATUS_META[status] ?? { color: colors.ink500, bg: colors.ink100 };
  return <span style={s.chip(meta.color, meta.bg)}>{status}</span>;
}

export default function ObjectiveDetail() {
  const { id } = useParams();
  // ?checkin=<keyResultId> — the Dashboard's "Check in" buttons land here
  // with that Key Result's inline form already open.
  const [searchParams] = useSearchParams();
  const autoCheckInId = searchParams.get('checkin');
  const { isMobile } = useWindowSize();
  const { t, tPlural } = useTerms();
  const pageStyle = isMobile ? s.pageMobile : s.page;
  const [objective, setObjective] = useState(null);
  const [keyResults, setKeyResults] = useState([]);
  const [reflections, setReflections] = useState([]);
  const [reflectionsRestricted, setReflectionsRestricted] = useState(false);
  const [cascadeLevels, setCascadeLevels] = useState([]);
  const [allObjectives, setAllObjectives] = useState([]);
  const [rubric, setRubric] = useState(null);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  function load() {
    // cascadeLevels/allObjectives/rubric are only used for the parent-Objective
    // selector and the inline Check-in form below — each caught independently
    // so a failure there can never masquerade as the primary Objective fetch
    // failing (which drives the notFound/forbidden branches below); it just
    // leaves re-parenting or check-in submission unavailable.
    return Promise.all([
      objectivesApi.get(id),
      cascadeLevelsApi.list().catch(() => ({ levels: [] })),
      objectivesApi.list().catch(() => ({ objectives: [] })),
      rubricApi.get().catch(() => ({ rubric: null })),
    ])
      .then(([result, levelResult, objResult, rubricResult]) => {
        setObjective(result.objective);
        setKeyResults(result.keyResults ?? []);
        setCascadeLevels(levelResult?.levels ?? []);
        setAllObjectives(objResult?.objectives ?? []);
        setRubric(rubricResult?.rubric ?? null);
      })
      .then(() =>
        // Fetched separately from the Objective itself — Reflections stay
        // restricted to owner/Manager/TenantAdmin even though the
        // Objective and Key Results are now tenant-wide readable (see
        // reflectionService.js's module comment), so this can 403 for a
        // viewer who can otherwise see the page fine. That must not take
        // down the rest of the page.
        objectivesApi.listReflections(id)
          .then((result) => setReflections(result.reflections ?? []))
          .catch((err) => {
            if (err.status === 403) setReflectionsRestricted(true);
            // any other error here is non-fatal to the page — Reflections
            // just stays empty rather than blocking Objective/Key Result content
          })
      )
      .catch((err) => {
        if (err.status === 404) setNotFound(true);
        else if (err.status === 403) setForbidden(true);
        else setError(err.message ?? 'Failed to load this Objective');
      });
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (notFound) {
    return <div style={pageStyle}><p style={{ color: colors.ink500 }}>{t('Objective')} not found.</p></div>;
  }
  if (forbidden) {
    return <div style={pageStyle}><p style={{ color: colors.ink500 }}>You don't have access to this {t('Objective').toLowerCase()}.</p></div>;
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

      {objective.canEdit && (
        <EditObjectiveForm
          objective={objective}
          cascadeLevels={cascadeLevels}
          allObjectives={allObjectives}
          onSaved={(updated) => setObjective((prev) => ({ ...prev, ...updated }))}
          label={t('Objective')}
        />
      )}

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
                  <th style={s.th}>{t('CheckIn')}</th>
                </tr>
              </thead>
              <tbody>
                {keyResults.map((kr) => (
                  <KeyResultRow
                    key={kr.id} keyResult={kr} canEdit={objective.canEdit} rubric={rubric} label={t('CheckIn')}
                    autoOpen={autoCheckInId === kr.id}
                    onSaved={(updated) => {
                      setKeyResults((prev) => prev.map((k) => (k.id === kr.id ? { ...k, ...updated } : k)));
                    }}
                    onCheckInCreated={load}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {objective.canEdit && (
          <AddKeyResultForm objectiveId={objective.id} onCreated={(kr) => setKeyResults((prev) => [...prev, kr])} label={t('KeyResult')} />
        )}
      </div>

      <div style={{ ...s.card, marginTop: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: colors.ink900 }}>{tPlural('Reflection')}</div>

        {reflectionsRestricted ? (
          <div style={{ fontSize: 13, color: colors.ink500, marginBottom: 16 }}>
            {tPlural('Reflection')} are only visible to the owner, their Manager, and Tenant Administrators.
          </div>
        ) : (
          <>
            {reflections.length === 0 && (
              <div style={{ fontSize: 13, color: colors.ink500, marginBottom: 16 }}>No {tPlural('Reflection').toLowerCase()} yet.</div>
            )}
            {reflections.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {reflections.map((r) => (
                  <div key={r.id} style={{ padding: 10, borderRadius: 8, border: `1px solid ${colors.line}` }}>
                    <div style={{ fontSize: 12, color: colors.ink400, marginBottom: 4 }}>{new Date(r.submittedAt).toLocaleString()}</div>
                    <div style={{ fontSize: 13, color: colors.ink900, whiteSpace: 'pre-wrap' }}>{r.content}</div>
                  </div>
                ))}
              </div>
            )}
            {objective.canEdit && (
              <AddReflectionForm objectiveId={objective.id} label={t('Reflection')} onCreated={(r) => setReflections((prev) => [r, ...prev])} />
            )}
          </>
        )}
      </div>
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
function EditObjectiveForm({ objective, cascadeLevels, allObjectives, onSaved, label }) {
  const [title, setTitle] = useState(objective.title);
  const [levelId, setLevelId] = useState(objective.cascadeLevelId);
  const [parentObjectiveId, setParentObjectiveId] = useState(objective.parentObjectiveId ?? '');
  const [editing, setEditing] = useState(false);
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

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} style={{ ...s.btnSecondary, padding: '6px 10px', fontSize: 12 }}>
        Edit
      </button>
    );
  }

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
      setEditing(false);
    } catch (err) {
      setError(err.message ?? `Failed to update ${label}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
      <div>
        <label style={s.label} htmlFor="edit-objective-title">Title</label>
        <input id="edit-objective-title" style={s.formInput} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <label style={s.label} htmlFor="edit-objective-level">Cascade level</label>
        <select
          id="edit-objective-level" style={s.select}
          value={levelId} onChange={(e) => handleLevelChange(e.target.value)}
        >
          {sortedLevels.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        {childTitles.length > 0 && (
          <div style={{ fontSize: 12, color: colors.warn, marginTop: 4 }}>
            Linked to {childTitles.length} child {label.toLowerCase()}{childTitles.length === 1 ? '' : 's'} ({childTitles.join(', ')}) —
            changing the level is blocked until they're re-parented or detached.
          </div>
        )}
      </div>

      {validParents.length > 0 && (
        <div>
          <label style={s.label} htmlFor="edit-objective-parent">Parent {label} (optional)</label>
          <select
            id="edit-objective-parent" style={s.select}
            value={parentObjectiveId} onChange={(e) => setParentObjectiveId(e.target.value)}
          >
            <option value="">No parent</option>
            {validParents.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" onClick={handleSave} disabled={saving} style={s.btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={() => setEditing(false)} style={s.btnSecondary}>Cancel</button>
      </div>
      {error && <span style={s.chip(colors.danger, colors.dangerBg)}>{error}</span>}
    </div>
  );
}

function KeyResultRow({ keyResult, canEdit, rubric, label, autoOpen = false, onSaved, onCheckInCreated }) {
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
        <td style={s.td} />
      </tr>
    );
  }

  return (
    <>
      <tr>
        <td style={s.td}>{keyResult.title}</td>
        <td style={s.td}>{Number(keyResult.weighting)}</td>
        <td style={s.td}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <StatusChip status={keyResult.status} />
            <Link to={`/key-results/${keyResult.id}`} style={{ ...s.btnSecondary, padding: '4px 8px', fontSize: 12, textDecoration: 'none', display: 'inline-block' }}>View</Link>
            {canEdit && (
              <button type="button" onClick={() => setEditing(true)} style={{ ...s.btnSecondary, padding: '4px 8px', fontSize: 12 }}>Edit</button>
            )}
          </div>
        </td>
        <td style={s.td}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {keyResult.lastCheckInAt ? (
              <span style={{ fontSize: 12, color: colors.ink500 }}>{new Date(keyResult.lastCheckInAt).toLocaleDateString()}</span>
            ) : (
              <span style={s.chip(colors.warn, colors.warnBg)}>No {label.toLowerCase()}s yet</span>
            )}
            {canEdit && (
              <button type="button" onClick={() => setCheckingIn((v) => !v)} style={{ ...s.btnSecondary, padding: '4px 8px', fontSize: 12 }}>
                {checkingIn ? 'Cancel' : `Check in`}
              </button>
            )}
          </div>
        </td>
      </tr>
      {checkingIn && (
        <tr>
          <td style={{ ...s.td, borderTop: 'none' }} colSpan={4}>
            {rubric ? (
              <div style={{ maxWidth: 420 }}>
                <SubmitCheckInForm
                  keyResultId={keyResult.id} rubric={rubric} label={label}
                  onCreated={() => { setCheckingIn(false); onCheckInCreated(); }}
                />
              </div>
            ) : (
              <div style={s.chip(colors.warn, colors.warnBg)}>
                No Scoring Rubric configured for this tenant yet — ask a Tenant Administrator to set one up under OKR Settings.
              </div>
            )}
          </td>
        </tr>
      )}
    </>
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
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={s.label}>New {label}</label>
      <textarea
        required style={{ ...s.formInput, minHeight: 70, resize: 'vertical' }}
        value={content} onChange={(e) => setContent(e.target.value)}
        placeholder="What went well, what didn't, what would we do differently?"
      />
      <div>
        <button type="submit" disabled={submitting} style={s.btnPrimary}>{submitting ? 'Submitting…' : `Submit ${label}`}</button>
      </div>
      {error && <div style={s.chip(colors.danger, colors.dangerBg)}>{error}</div>}
    </form>
  );
}
