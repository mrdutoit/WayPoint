import { buildObjectiveTree } from './objectiveTree.js';

// Tidy left-to-right layout for the Alignment Map's strategy canvas.
// Columns are cascade LEVELS (not tree depth), so every Company objective
// lines up under "Company" even if one skips a level; rows are assigned
// leaf-first, with each parent centred on its visible children. Pure and
// unit-tested (tests/strategyLayout.test.js) — the component only draws.
//
// objectives: flat list with id, parentObjectiveId, cascadeLevelIndex
// collapsed: Set of ids whose children are hidden
// returns { nodes: [{ ...objective, col, row, childCount, depth }],
//           edges: [{ from, to }], columns: [levelIndex...], rowCount }

export function strategyLayout(objectives, collapsed = new Set()) {
  const columns = [...new Set(objectives.map((o) => o.cascadeLevelIndex))].sort((a, b) => a - b);
  const colOf = new Map(columns.map((lvl, i) => [lvl, i]));
  const roots = buildObjectiveTree(objectives).sort(
    (a, b) => a.cascadeLevelIndex - b.cascadeLevelIndex
  );

  const nodes = [];
  const edges = [];
  let nextRow = 0;

  function place(node, depth) {
    const visibleChildren = collapsed.has(node.id) ? [] : node.children;
    let row;
    if (visibleChildren.length === 0) {
      row = nextRow;
      nextRow += 1;
    } else {
      const childRows = visibleChildren.map((child) => {
        edges.push({ from: node.id, to: child.id });
        return place(child, depth + 1);
      });
      row = (childRows[0] + childRows[childRows.length - 1]) / 2;
    }
    const { children, ...rest } = node;
    nodes.push({ ...rest, col: colOf.get(node.cascadeLevelIndex) ?? 0, row, depth, childCount: children.length });
    return row;
  }

  for (const root of roots) place(root, 0);
  return { nodes, edges, columns, rowCount: nextRow };
}

/** Every ancestor and descendant id of `id` (plus itself) — the lineage the canvas highlights on hover. */
export function lineageOf(objectives, id) {
  const byId = new Map(objectives.map((o) => [o.id, o]));
  const out = new Set([id]);
  let cursor = byId.get(id);
  while (cursor?.parentObjectiveId && byId.has(cursor.parentObjectiveId) && !out.has(cursor.parentObjectiveId)) {
    out.add(cursor.parentObjectiveId);
    cursor = byId.get(cursor.parentObjectiveId);
  }
  const stack = [id];
  while (stack.length) {
    const current = stack.pop();
    for (const o of objectives) {
      if (o.parentObjectiveId === current && !out.has(o.id)) {
        out.add(o.id);
        stack.push(o.id);
      }
    }
  }
  return out;
}
