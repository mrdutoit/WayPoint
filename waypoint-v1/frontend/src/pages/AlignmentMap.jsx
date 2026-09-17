import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { reportsApi } from '../services/api.js';
import { s, colors, STATUS_META } from '../styles/tokens.js';
import { buildObjectiveTree } from '../utils/objectiveTree.js';

function StatusChip({ status }) {
  const meta = STATUS_META[status] ?? { color: colors.ink500, bg: colors.ink100 };
  return <span style={s.chip(meta.color, meta.bg)}>{status}</span>;
}

// Sam's Stage 2 design review: "must stay usable for a deep cascade —
// collapse/expand rather than rendering the full tree by default."
// Starts collapsed below the top level so a large org doesn't render
// hundreds of rows on first load.
function TreeNode({ node, depth }) {
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
        <span style={{ fontSize: 11, color: colors.ink400, textTransform: 'uppercase' }}>{node.cascadeLevel}</span>
        <span style={{ fontSize: 13, color: colors.ink900, flex: '1 1 auto' }}>{node.title}</span>
        <span style={{ fontSize: 12, color: colors.ink500 }}>{node.ownerFirstName} {node.ownerLastName}</span>
        <StatusChip status={node.status} />
      </div>
      {expanded && node.children.map((child) => <TreeNode key={child.id} node={child} depth={depth + 1} />)}
    </div>
  );
}

export default function AlignmentMap() {
  const { isMobile } = useWindowSize();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    reportsApi.alignmentMap().then(setData).catch((err) => setError(err.message ?? 'Failed to load the alignment map'));
  }, []);

  const pageStyle = isMobile ? s.pageMobile : s.page;
  if (error) return <div style={pageStyle}><div style={s.chip(colors.danger, colors.dangerBg)}>{error}</div></div>;
  if (!data) return <div style={pageStyle}><p style={{ fontSize: 13, color: colors.ink500 }}>Loading…</p></div>;

  const tree = buildObjectiveTree(data.objectives);

  return (
    <div style={pageStyle}>
      <Link to="/reports" style={{ fontSize: 13, color: colors.brand600, textDecoration: 'none' }}>&larr; Reports</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 8, marginBottom: 4, color: colors.ink900 }}>Alignment map</h1>

      {!data.cycle ? (
        <p style={{ fontSize: 13, color: colors.ink500 }}>No active Cycle right now.</p>
      ) : (
        <>
          <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 20 }}>{data.cycle.name}</p>
          {tree.length === 0 ? (
            <p style={{ fontSize: 13, color: colors.ink500 }}>No Objectives this Cycle.</p>
          ) : (
            <div style={s.card}>
              {tree.map((root) => <TreeNode key={root.id} node={root} depth={0} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
