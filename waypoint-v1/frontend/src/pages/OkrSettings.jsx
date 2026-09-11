import { useEffect, useState } from 'react';
import { useRole } from '../context/RoleContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { cascadeLevelsApi, cyclesApi, rubricApi } from '../services/api.js';
import { s, colors } from '../styles/tokens.js';

const SECTION_TITLE = { fontSize: 16, fontWeight: 700, marginBottom: 4, color: colors.ink900 };
const SECTION_NOTE = { fontSize: 13, color: colors.ink500, marginBottom: 16 };

export default function OkrSettings() {
  const { isTenantAdmin } = useRole();
  const { isMobile } = useWindowSize();
  const pageStyle = isMobile ? s.pageMobile : s.page;

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
        Configure the cascade structure, review cycles, and scoring rubric that Objectives and Key Results
        are built against. Terminology renaming (FR-013) and OKR element toggles (FR-025) ship with the
        Administration module.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <CascadeLevelsSection />
        <CyclesSection />
        <RubricSection />
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

// ---------- Cycles (FR-014) ----------
function CyclesSection() {
  const [cycles, setCycles] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', cadence: 'Quarterly', startDate: '', endDate: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [activatingId, setActivatingId] = useState(null);

  function load() {
    return cyclesApi.list()
      .then((result) => setCycles(result?.cycles ?? []))
      .catch((err) => setError(err.message ?? 'Failed to load cycles'));
  }
  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await cyclesApi.create(form);
      setForm({ name: '', cadence: 'Quarterly', startDate: '', endDate: '' });
      await load();
    } catch (err) {
      setCreateError(err.message ?? 'Failed to create cycle');
    } finally {
      setCreating(false);
    }
  }

  async function handleActivate(id) {
    setActivatingId(id);
    try {
      await cyclesApi.activate(id);
      await load();
    } catch (err) {
      setError(err.message ?? 'Failed to activate cycle');
    } finally {
      setActivatingId(null);
    }
  }

  return (
    <div style={s.card}>
      <div style={SECTION_TITLE}>Cycles</div>
      <div style={SECTION_NOTE}>Only one Cycle can be active at a time — Objectives are created in whichever Cycle is active.</div>

      {error && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginBottom: 12 }}>{error}</div>}
      {cycles === null && !error && <div style={{ fontSize: 13, color: colors.ink500 }}>Loading…</div>}
      {cycles && cycles.length === 0 && <div style={{ fontSize: 13, color: colors.ink500, marginBottom: 12 }}>No cycles yet — create the first one below.</div>}

      {cycles && cycles.length > 0 && (
        <div style={{ ...s.tableCard, marginBottom: 16 }}>
          <table style={{ ...s.table, minWidth: 460 }}>
            <thead>
              <tr>
                <th style={s.th}>Name</th>
                <th style={s.th}>Cadence</th>
                <th style={s.th}>Dates</th>
                <th style={s.th}>Status</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => (
                <tr key={c.id}>
                  <td style={s.td}>{c.name}</td>
                  <td style={s.td}>{c.cadence}</td>
                  <td style={s.td}>{c.start_date} – {c.end_date}</td>
                  <td style={s.td}>
                    {c.is_active
                      ? <span style={s.chip(colors.success, colors.successBg)}>Active</span>
                      : <span style={s.chip(colors.ink500, colors.ink100)}>Inactive</span>}
                  </td>
                  <td style={s.td}>
                    {!c.is_active && (
                      <button
                        type="button" onClick={() => handleActivate(c.id)} disabled={activatingId === c.id}
                        style={{ ...s.btnSecondary, padding: '6px 10px', fontSize: 12 }}
                      >
                        {activatingId === c.id ? 'Activating…' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 160px' }}>
          <label style={s.label}>Name</label>
          <input required style={s.formInput} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Q1 2026" />
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <label style={s.label}>Cadence</label>
          <input required style={s.formInput} value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })} placeholder="Quarterly" />
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <label style={s.label}>Start date</label>
          <input required type="date" style={s.formInput} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <label style={s.label}>End date</label>
          <input required type="date" style={s.formInput} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        </div>
        <button type="submit" disabled={creating} style={s.btnPrimary}>{creating ? 'Creating…' : 'Add cycle'}</button>
      </form>
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
