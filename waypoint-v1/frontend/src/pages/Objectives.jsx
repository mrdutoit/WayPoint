import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import { useTerms } from '../context/TerminologyContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { objectivesApi, cascadeLevelsApi } from '../services/api.js';
import { s, colors, radius, STATUS_META } from '../styles/tokens.js';
import { buildObjectiveTree } from '../utils/objectiveTree.js';

function StatusChip({ status }) {
  const meta = STATUS_META[status] ?? { color: colors.ink500, bg: colors.ink100 };
  return <span style={s.chip(meta.color, meta.bg)}>{status}</span>;
}

function ViewToggle({ view, onChange }) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${colors.line}`, borderRadius: radius.sm, overflow: 'hidden' }}>
      {[['hierarchy', 'Hierarchy'], ['list', 'List']].map(([value, label]) => (
        <button
          key={value} type="button" onClick={() => onChange(value)}
          style={{
            padding: '7px 14px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: view === value ? colors.brand600 : colors.panel,
            color: view === value ? '#fff' : colors.ink700,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Same layout as AlignmentMap.jsx's TreeNode (so the two views of the
// same cascade look like the same feature, not two unrelated screens),
// with the title as a link through to the edit page — this is still the
// CRUD entry point, the Alignment Map report never was.
function ObjectiveTreeNode({ node, depth, levelLabelById }) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
        paddingLeft: depth * 24, borderBottom: `1px solid ${colors.line}`, flexWrap: 'wrap',
      }}>
        {hasChildren ? (
          <button
            type="button" onClick={() => setExpanded((v) => !v)}
            style={{ ...s.btnSecondary, padding: '2px 8px', fontSize: 12, minWidth: 24 }}
          >
            {expanded ? '−' : '+'}
          </button>
        ) : <span style={{ width: 24 }} />}
        <span style={{ fontSize: 11, color: colors.ink400, textTransform: 'uppercase' }}>
          {levelLabelById[node.cascadeLevelId] ?? '—'}
        </span>
        <Link
          to={`/objectives/${node.id}`}
          style={{ fontSize: 13, color: colors.brand600, textDecoration: 'none', fontWeight: 600, flex: '1 1 auto' }}
        >
          {node.title}
        </Link>
        <span style={{ fontSize: 12, color: colors.ink500 }}>{node.ownerFirstName} {node.ownerLastName}</span>
        <StatusChip status={node.status} />
      </div>
      {expanded && node.children.map((child) => (
        <ObjectiveTreeNode key={child.id} node={child} depth={depth + 1} levelLabelById={levelLabelById} />
      ))}
    </div>
  );
}

export default function Objectives() {
  const { role } = useRole();
  const { t, tPlural } = useTerms();
  const { isMobile } = useWindowSize();
  const [objectives, setObjectives] = useState(null);
  const [cascadeLevels, setCascadeLevels] = useState([]);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState('hierarchy');

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

  const tree = useMemo(() => buildObjectiveTree(objectives ?? []), [objectives]);

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: colors.ink500, margin: 0 }}>
          All {tPlural('Objective').toLowerCase()} in your organisation for the current Cycle — you can edit your own and your direct reports' (FR-020).
        </p>
        {objectives && objectives.length > 0 && <ViewToggle view={view} onChange={setView} />}
      </div>

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

      {objectives && objectives.length > 0 && view === 'hierarchy' && (
        <div style={s.card}>
          {tree.map((root) => (
            <ObjectiveTreeNode key={root.id} node={root} depth={0} levelLabelById={levelLabelById} />
          ))}
        </div>
      )}

      {objectives && objectives.length > 0 && view === 'list' && (
        <div style={s.tableCard}>
          <table style={{ ...s.table, minWidth: 480 }}>
            <thead>
              <tr>
                <th style={s.th}>Title</th>
                <th style={s.th}>Owner</th>
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
                  <td style={s.td}>{o.ownerFirstName} {o.ownerLastName}</td>
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
