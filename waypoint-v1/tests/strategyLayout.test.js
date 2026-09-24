import { describe, it, expect } from 'vitest';
import { strategyLayout, lineageOf } from '../frontend/src/utils/strategyLayout.js';

const O = (id, level, parent = null) => ({ id, cascadeLevelIndex: level, parentObjectiveId: parent, title: id });
const TREE = [
  O('co', 1), O('divA', 2, 'co'), O('divB', 2, 'co'),
  O('team', 3, 'divA'), O('ind1', 4, 'team'), O('ind2', 4, 'team'),
  O('orphan', 4),
];

describe('strategyLayout', () => {
  it('assigns columns by cascade level, not tree depth', () => {
    const { nodes, columns } = strategyLayout(TREE);
    const col = Object.fromEntries(nodes.map((n) => [n.id, n.col]));
    expect(columns).toEqual([1, 2, 3, 4]);
    expect(col).toMatchObject({ co: 0, divA: 1, team: 2, ind1: 3, orphan: 3 });
  });

  it('gives leaves consecutive rows and centres parents on their children', () => {
    const { nodes, rowCount } = strategyLayout(TREE);
    const row = Object.fromEntries(nodes.map((n) => [n.id, n.row]));
    expect(row.ind1).toBe(0);
    expect(row.ind2).toBe(1);
    expect(row.team).toBe(0.5);
    expect(row.divA).toBe(0.5);
    expect(row.divB).toBe(2);
    expect(row.co).toBe((0.5 + 2) / 2);
    expect(row.orphan).toBe(3);
    expect(rowCount).toBe(4);
  });

  it('draws one edge per visible parent-child link', () => {
    const { edges } = strategyLayout(TREE);
    expect(edges).toHaveLength(5);
    expect(edges).toContainEqual({ from: 'team', to: 'ind2' });
  });

  it('collapsing a node hides its whole subtree but keeps its child count', () => {
    const { nodes, edges, rowCount } = strategyLayout(TREE, new Set(['divA']));
    expect(nodes.map((n) => n.id)).not.toContain('team');
    expect(nodes.find((n) => n.id === 'divA').childCount).toBe(1);
    expect(edges).toHaveLength(2);
    expect(rowCount).toBe(3);
  });
});

describe('lineageOf', () => {
  it('returns the node, all ancestors and all descendants — not siblings', () => {
    const l = lineageOf(TREE, 'divA');
    expect([...l].sort()).toEqual(['co', 'divA', 'ind1', 'ind2', 'team']);
    expect(l.has('divB')).toBe(false);
  });
});
