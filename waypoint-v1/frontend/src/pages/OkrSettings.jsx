import { useEffect, useState } from 'react';
import { useRole } from '../context/RoleContext.jsx';
import { useTerms } from '../context/TerminologyContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { cascadeLevelsApi, cyclesApi, rubricApi, cadencesApi, okrElementsApi, terminologyApi } from '../services/api.js';
import { s, colors } from '../styles/tokens.js';
import DatePicker from '../components/DatePicker.jsx';

const SECTION_TITLE = { fontSize: 16, fontWeight: 700, marginBottom: 4, color: colors.ink900 };
const SECTION_NOTE = { fontSize: 13, color: colors.ink500, marginBottom: 16 };

export default function OkrSettings() {
  const { isTenantAdmin } = useRole();
  const { isMobile } = useWindowSize();
  const pageStyle = isMobile ? s.pageMobile : s.page;

  // Lifted here (rather than fetched independently inside CyclesSection)
  // so adding/renaming/removing a Cadence below immediately shows up in
  // the Cycles form's dropdown, instead of needing a page reload.
  const [cadences, setCadences] = useState(null);
  const [cadencesError, setCadencesError] = useState(null);

  function loadCadences() {
    return cadencesApi.list()
      .then((result) => setCadences(result?.cadences ?? []))
      .catch((err) => setCadencesError(err.message ?? 'Failed to load cadences'));
  }
  useEffect(() => { loadCadences(); }, []);

  if (!isTenantAdmin) {
    return (
      <div style={pageStyle}>
        <p style={{ color: colors.ink500 }}>This page is only available to Tenant Administrators.</p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: colors.ink900 }}>OKR Settings</h1>
      <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 24 }}>
        Configure the cascade structure, review cycles, scoring rubric, terminology, and which OKR elements
        are in use for your organisation.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <CascadeLevelsSection />
        <CadencesSection cadences={cadences} error={cadencesError} onChanged={loadCadences} />
        <CyclesSection cadences={cadences} />
        <RubricSection />
        <TerminologySection />
        <OkrElementsSection />
      </div>
    </div>
  );
}

// ---------- Cascade Levels (FR-012) ----------
function CascadeLevelsSection() {
  const [levels, setLevels] = useState(null);
  const [error, setError] = useState(null);
  const [labels, setLabels] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    cascadeLevelsApi.list()
      .then((result) => {
        const rows = result?.levels ?? [];
        setLevels(rows);
        setLabels(rows.length > 0 ? rows.map((r) => r.label) : ['Company']);
      })
      .catch((err) => setError(err.message ?? 'Failed to load cascade levels'));
  }, []);

  function updateLabel(i, value) {
    setLabels((prev) => prev.map((l, idx) => (idx === i ? value : l)));
  }
  function addLevel() {
    if (labels.length >= 4) return;
    setLabels((prev) => [...prev, '']);
  }
  function removeLevel(i) {
    if (labels.length <= 1) return;
    setLabels((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await cascadeLevelsApi.update(labels);
      setLevels(result.levels);
    } catch (err) {
      setSaveError(err.message ?? 'Failed to save cascade levels');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.card}>
      <div style={SECTION_TITLE}>Cascade Levels</div>
      <div style={SECTION_NOTE}>One to four levels, top first (e.g. Company, Division, Team, Individual).</div>

      {error && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginBottom: 12 }}>{error}</div>}
      {levels === null && !error && <div style={{ fontSize: 13, color: colors.ink500 }}>Loading…</div>}

      {levels !== null && (
        <>
          {labels.map((label, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: colors.ink500, width: 20 }}>{i + 1}</span>
              <input
                style={s.formInput}
                value={label}
                onChange={(e) => updateLabel(i, e.target.value)}
                placeholder={`Level ${i + 1} label`}
              />
              <button
                type="button" onClick={() => removeLevel(i)} disabled={labels.length <= 1}
                style={{ ...s.btnSecondary, padding: '9px 12px' }}
              >
                Remove
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" onClick={addLevel} disabled={labels.length >= 4} style={s.btnSecondary}>
              Add level
            </button>
            <button type="button" onClick={handleSave} disabled={saving} style={s.btnPrimary}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          {saveError && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginTop: 12 }}>{saveError}</div>}
        </>
      )}
    </div>
  );
}

// ---------- Cadences ----------
// Tenant-editable (Monthly/Quarterly/Bi-Annually/Annually seeded as
// defaults on tenant creation). Once a Cadence is used by any Cycle,
// editing or deleting it is refused server-side (409) — rather than
// pre-disabling the controls (which would need an extra "is this in
// use" flag per row), the error surfaces inline on the attempt, same as
// every other in-use guard in this app (Cascade Levels above works the
// same way).
function CadencesSection({ cadences, error, onChanged }) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div style={s.card}>
      <div style={SECTION_TITLE}>Cadences</div>
      <div style={SECTION_NOTE}>
        How often a Cycle repeats — used to compute its end date automatically. A Cadence already used by a
        Cycle is locked; create a new one instead of editing it.
      </div>

      {error && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginBottom: 12 }}>{error}</div>}
      {cadences === null && !error && <div style={{ fontSize: 13, color: colors.ink500 }}>Loading…</div>}

      {cadences && cadences.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {cadences.map((c) => (
            <CadenceRow key={c.id} cadence={c} onChanged={onChanged} />
          ))}
        </div>
      )}

      {showAdd ? (
        <AddCadenceForm onCreated={() => { setShowAdd(false); onChanged(); }} onCancel={() => setShowAdd(false)} />
      ) : (
        <button type="button" onClick={() => setShowAdd(true)} style={s.btnSecondary}>Add cadence</button>
      )}
    </div>
  );
}

function CadenceRow({ cadence, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(cadence.label);
  const [months, setMonths] = useState(String(cadence.months));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await cadencesApi.update(cadence.id, { label, months: Number(months) });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err.message ?? 'Failed to update cadence');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    setError(null);
    try {
      await cadencesApi.remove(cadence.id);
      onChanged();
    } catch (err) {
      setError(err.message ?? 'Failed to delete cadence');
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input style={{ ...s.formInput, maxWidth: 180 }} value={label} onChange={(e) => setLabel(e.target.value)} />
        <input style={{ ...s.formInput, width: 90 }} type="number" min="1" step="1" value={months} onChange={(e) => setMonths(e.target.value)} />
        <span style={{ fontSize: 12, color: colors.ink500 }}>month(s)</span>
        <button type="button" onClick={handleSave} disabled={saving} style={{ ...s.btnPrimary, padding: '6px 10px', fontSize: 12 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => setEditing(false)} style={{ ...s.btnSecondary, padding: '6px 10px', fontSize: 12 }}>Cancel</button>
        {error && <div style={s.chip(colors.danger, colors.dangerBg)}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <span style={{ fontSize: 14, color: colors.ink900, minWidth: 120 }}>{cadence.label}</span>
      <span style={{ fontSize: 13, color: colors.ink500 }}>{cadence.months} month(s)</span>
      <button type="button" onClick={() => setEditing(true)} style={{ ...s.btnSecondary, padding: '4px 8px', fontSize: 12 }}>Edit</button>
      <button type="button" onClick={handleDelete} disabled={saving} style={{ ...s.btnSecondary, padding: '4px 8px', fontSize: 12 }}>
        {saving ? 'Deleting…' : 'Delete'}
      </button>
      {error && <div style={s.chip(colors.danger, colors.dangerBg)}>{error}</div>}
    </div>
  );
}

function AddCadenceForm({ onCreated, onCancel }) {
  const [label, setLabel] = useState('');
  const [months, setMonths] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await cadencesApi.create({ label, months: Number(months) });
      onCreated();
    } catch (err) {
      setError(err.message ?? 'Failed to create cadence');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div>
        <label style={s.label}>Label</label>
        <input required style={{ ...s.formInput, maxWidth: 180 }} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Weekly" />
      </div>
      <div>
        <label style={s.label}>Months</label>
        <input required style={{ ...s.formInput, width: 90 }} type="number" min="1" step="1" value={months} onChange={(e) => setMonths(e.target.value)} />
      </div>
      <button type="submit" disabled={submitting} style={s.btnPrimary}>{submitting ? 'Adding…' : 'Add'}</button>
      <button type="button" onClick={onCancel} style={s.btnSecondary}>Cancel</button>
      {error && <div style={s.chip(colors.danger, colors.dangerBg)}>{error}</div>}
    </form>
  );
}

// ---------- Cycles (FR-014) ----------
// "Active" is computed from today's date against [startDate, endDate] —
// there is no activate action any more. end_date is always
// server-computed from startDate + the chosen Cadence.
function CyclesSection({ cadences }) {
  const { t, tPlural } = useTerms();
  const [cycles, setCycles] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', cadenceId: '', startDate: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  function load() {
    return cyclesApi.list()
      .then((result) => setCycles(result?.cycles ?? []))
      .catch((err) => setError(err.message ?? 'Failed to load cycles'));
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (cadences && cadences.length > 0 && !form.cadenceId) {
      setForm((f) => ({ ...f, cadenceId: cadences[0].id }));
    }
  }, [cadences]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await cyclesApi.create(form);
      setForm((f) => ({ ...f, name: '', startDate: '' }));
      await load();
    } catch (err) {
      setCreateError(err.message ?? 'Failed to create cycle');
    } finally {
      setCreating(false);
    }
  }

  const statusChip = (status) => {
    if (status === 'Active') return <span style={s.chip(colors.success, colors.successBg)}>Active</span>;
    if (status === 'Upcoming') return <span style={s.chip(colors.brand600, colors.ink100)}>Upcoming</span>;
    return <span style={s.chip(colors.ink500, colors.ink100)}>Past</span>;
  };

  return (
    <div style={s.card}>
      <div style={SECTION_TITLE}>{tPlural('Cycle')}</div>
      <div style={SECTION_NOTE}>
        The Cycle covering today's date is automatically the active one — Objectives are created in it.
        End date is computed from the start date and Cadence.
      </div>

      {error && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginBottom: 12 }}>{error}</div>}
      {cycles === null && !error && <div style={{ fontSize: 13, color: colors.ink500 }}>Loading…</div>}
      {cycles && cycles.length === 0 && <div style={{ fontSize: 13, color: colors.ink500, marginBottom: 12 }}>No {tPlural('Cycle').toLowerCase()} yet — create the first one below.</div>}

      {cycles && cycles.length > 0 && (
        <div style={{ ...s.tableCard, marginBottom: 16 }}>
          <table style={{ ...s.table, minWidth: 460 }}>
            <thead>
              <tr>
                <th style={s.th}>Name</th>
                <th style={s.th}>Cadence</th>
                <th style={s.th}>Dates</th>
                <th style={s.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => (
                <tr key={c.id}>
                  <td style={s.td}>{c.name}</td>
                  <td style={s.td}>{c.cadenceLabel}</td>
                  <td style={s.td}>{c.startDate} – {c.endDate}</td>
                  <td style={s.td}>{statusChip(c.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(!cadences || cadences.length === 0) && cycles !== null && (
        <div style={{ ...s.chip(colors.warn, colors.warnBg), marginBottom: 12 }}>
          Add a Cadence above before creating a Cycle.
        </div>
      )}

      {cadences && cadences.length > 0 && (
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label style={s.label}>Name</label>
            <input required style={s.formInput} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Q1 2026" />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={s.label}>Cadence</label>
            <select style={s.select} value={form.cadenceId} onChange={(e) => setForm({ ...form, cadenceId: e.target.value })}>
              {cadences.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={s.label}>Start date</label>
            <DatePicker value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} required />
          </div>
          <button type="submit" disabled={creating} style={s.btnPrimary}>{creating ? 'Creating…' : `Add ${t('Cycle')}`}</button>
        </form>
      )}
      {createError && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginTop: 12 }}>{createError}</div>}
    </div>
  );
}

// ---------- Scoring Rubric (FR-017) ----------
function RubricSection() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [name, setName] = useState('Standard');
  const [levels, setLevels] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    rubricApi.get()
      .then((result) => {
        if (result.rubric) {
          setName(result.rubric.name);
          setLevels(result.rubric.levels.map((l) => l.label));
        } else {
          setLevels(result.defaultLevels ?? []);
        }
        setLoaded(true);
      })
      .catch((err) => { setError(err.message ?? 'Failed to load the scoring rubric'); setLoaded(true); });
  }, []);

  function updateLevel(i, value) {
    setLevels((prev) => prev.map((l, idx) => (idx === i ? value : l)));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await rubricApi.update(name, levels);
      setLevels(result.rubric.levels.map((l) => l.label));
    } catch (err) {
      setSaveError(err.message ?? 'Failed to save the scoring rubric');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.card}>
      <div style={SECTION_TITLE}>Scoring Rubric</div>
      <div style={SECTION_NOTE}>Four or five ordered levels, lowest first — used to score every Key Result in your organisation.</div>

      {error && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginBottom: 12 }}>{error}</div>}
      {!loaded && <div style={{ fontSize: 13, color: colors.ink500 }}>Loading…</div>}

      {loaded && (
        <>
          <label style={s.label}>Rubric name</label>
          <input style={{ ...s.formInput, marginBottom: 14 }} value={name} onChange={(e) => setName(e.target.value)} />

          {levels.map((label, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: colors.ink500, width: 20 }}>{i + 1}</span>
              <input style={s.formInput} value={label} onChange={(e) => updateLevel(i, e.target.value)} />
            </div>
          ))}

          <button type="button" onClick={handleSave} disabled={saving} style={{ ...s.btnPrimary, marginTop: 8 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saveError && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginTop: 12 }}>{saveError}</div>}
        </>
      )}
    </div>
  );
}

// ---------- Terminology (FR-013) ----------
// Applied to primary UI surfaces (nav, page titles, section headers,
// main buttons) — see TerminologyContext.jsx's module comment for the
// exact scope. A blank field resets that term to its default.
function TerminologySection() {
  const { terms, reload } = useTerms();
  const [values, setValues] = useState(terms);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setValues(terms); }, [terms]);

  const TERM_ROWS = [
    ['Objective', 'Objective'],
    ['KeyResult', 'Key Result'],
    ['Cycle', 'Cycle'],
    ['CheckIn', 'Check-in'],
    ['Initiative', 'Initiative'],
    ['Reflection', 'Reflection'],
  ];

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await terminologyApi.update(values);
      await reload();
      setSaved(true);
    } catch (err) {
      setSaveError(err.message ?? 'Failed to save terminology');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.card}>
      <div style={SECTION_TITLE}>Terminology</div>
      <div style={SECTION_NOTE}>
        Rename these terms for your organisation — applied throughout the nav, page titles, and section
        headers. Leave a field blank to reset it to the default shown as its placeholder.
      </div>

      {TERM_ROWS.map(([key, defaultLabel]) => (
        <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: colors.ink500, width: 90 }}>{defaultLabel}</span>
          <input
            style={s.formInput}
            value={values[key] === defaultLabel ? '' : (values[key] ?? '')}
            placeholder={defaultLabel}
            onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value || defaultLabel }))}
          />
        </div>
      ))}

      <button type="button" onClick={handleSave} disabled={saving} style={{ ...s.btnPrimary, marginTop: 8 }}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      {saved && !saving && <span style={{ ...s.chip(colors.success, colors.successBg), marginLeft: 10 }}>Saved</span>}
      {saveError && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginTop: 12 }}>{saveError}</div>}
    </div>
  );
}

// ---------- OKR Elements (FR-025) ----------
// Objective can never be disabled (no toggle rendered for it). Disabling
// an element with an enabled dependent is refused server-side — the
// error names the dependent(s), shown inline rather than pre-disabling
// the toggle, same reasoning as Cadences' in-use guard above.
const ELEMENT_ROWS = [
  ['KeyResult', 'Key Result', 'Requires Objective'],
  ['Initiative', 'Initiative', 'Requires Key Result'],
  ['CheckIn', 'Check-in', 'Requires Key Result'],
  ['Reflection', 'Reflection', 'Requires Objective'],
];

function OkrElementsSection() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  const [rowError, setRowError] = useState(null);

  function load() {
    return okrElementsApi.list()
      .then((result) => setConfig(result?.elements ?? null))
      .catch((err) => setError(err.message ?? 'Failed to load OKR element configuration'));
  }
  useEffect(() => { load(); }, []);

  async function handleToggle(key, nextEnabled) {
    setSavingKey(key);
    setRowError(null);
    try {
      const result = await okrElementsApi.update(key, nextEnabled);
      setConfig(result.elements);
    } catch (err) {
      setRowError(err.message ?? `Failed to update ${key}`);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div style={s.card}>
      <div style={SECTION_TITLE}>OKR Elements</div>
      <div style={SECTION_NOTE}>
        Which of the five OKR elements your organisation uses. Objective is always on. Initiative, Check-in,
        and Reflection don't have functionality behind them yet (they ship in Module 3) — toggling them now
        has no visible effect until then.
      </div>

      {error && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginBottom: 12 }}>{error}</div>}
      {config === null && !error && <div style={{ fontSize: 13, color: colors.ink500 }}>Loading…</div>}

      {config && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, color: colors.ink900, minWidth: 120 }}>Objective</span>
            <span style={s.chip(colors.success, colors.successBg)}>Always on</span>
          </div>
          {ELEMENT_ROWS.map(([key, label, hint]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, color: colors.ink900, minWidth: 120 }}>{label}</span>
              <button
                type="button"
                onClick={() => handleToggle(key, !config[key])}
                disabled={savingKey === key}
                style={{
                  ...s.btnSecondary, padding: '6px 12px', fontSize: 12,
                  background: config[key] ? colors.successBg : colors.ink100,
                  color: config[key] ? colors.success : colors.ink500,
                  border: 'none',
                }}
              >
                {savingKey === key ? 'Saving…' : config[key] ? 'Enabled' : 'Disabled'}
              </button>
              <span style={{ fontSize: 12, color: colors.ink500 }}>{hint}</span>
            </div>
          ))}
        </div>
      )}
      {rowError && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginTop: 12 }}>{rowError}</div>}
    </div>
  );
}
