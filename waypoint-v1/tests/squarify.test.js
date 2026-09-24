import { describe, it, expect } from 'vitest';
import { squarify } from '../frontend/src/utils/squarify.js';

const area = (t) => t.w * t.h;

describe('squarify', () => {
  it('fills the rectangle exactly, each tile proportional to its value', () => {
    const tiles = squarify([{ id: 'a', value: 6 }, { id: 'b', value: 3 }, { id: 'c', value: 1 }], { x: 0, y: 0, w: 100, h: 50 });
    expect(tiles).toHaveLength(3);
    const total = tiles.reduce((s, t) => s + area(t), 0);
    expect(total).toBeCloseTo(5000, 6);
    const byId = Object.fromEntries(tiles.map((t) => [t.id, area(t)]));
    expect(byId.a / byId.c).toBeCloseTo(6, 6);
    expect(byId.b / byId.c).toBeCloseTo(3, 6);
  });

  it('keeps every tile inside the rectangle', () => {
    const tiles = squarify([5, 4, 3, 2, 2, 1, 1].map((value, i) => ({ id: i, value })), { x: 0, y: 0, w: 1000, h: 320 });
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-9);
      expect(t.y).toBeGreaterThanOrEqual(-1e-9);
      expect(t.x + t.w).toBeLessThanOrEqual(1000 + 1e-6);
      expect(t.y + t.h).toBeLessThanOrEqual(320 + 1e-6);
    }
  });

  it('drops zero and negative values, and returns nothing for an empty total', () => {
    expect(squarify([{ value: 0 }, { value: -2 }], { x: 0, y: 0, w: 10, h: 10 })).toEqual([]);
    expect(squarify([{ value: 0 }, { value: 2 }], { x: 0, y: 0, w: 10, h: 10 })).toHaveLength(1);
  });

  it('gives a single item the whole rectangle', () => {
    expect(squarify([{ value: 3 }], { x: 0, y: 0, w: 40, h: 20 })[0]).toMatchObject({ x: 0, y: 0, w: 40, h: 20 });
  });
});
