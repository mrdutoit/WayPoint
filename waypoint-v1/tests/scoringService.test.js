import { describe, it, expect, vi } from 'vitest';
import { recomputeKeyResultStatus, recomputeObjectiveStatus, recomputeTenantStatuses } from '../frontend/api-lib/services/scoringService.js';

function mockClient() {
  return { query: vi.fn() };
}

describe('recomputeKeyResultStatus', () => {
  it('returns "Not Started" when the Key Result has no Check-ins', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // most-recent-check-in lookup — none found
      .mockResolvedValueOnce({}); // UPDATE
    const status = await recomputeKeyResultStatus(client, 't1', 'kr-1');
    expect(status).toBe('Not Started');
    expect(client.query.mock.calls[1][1]).toEqual(['t1', 'kr-1', 'Not Started']);
  });

  it('uses the most recent Check-in\'s rubric level label', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ label: 'On Track' }] })
      .mockResolvedValueOnce({});
    const status = await recomputeKeyResultStatus(client, 't1', 'kr-1');
    expect(status).toBe('On Track');
    expect(client.query.mock.calls[1][1]).toEqual(['t1', 'kr-1', 'On Track']);
  });
});

const RUBRIC_LEVELS = [
  { level_index: 1, label: 'Off Track' },
  { level_index: 2, label: 'At Risk' },
  { level_index: 3, label: 'On Track' },
  { level_index: 4, label: 'Achieved' },
];

// Query order as of the 2026-09-23 fix, whenever rubric levels exist:
// [levels, own Key Results, child Objectives, UPDATE, parent lookup].
// Own Key Results and children are now ALWAYS both queried and combined —
// never either/or — which is exactly what the fix changed.

describe('recomputeObjectiveStatus — no rubric levels configured', () => {
  it('returns "Not Started" and never queries Key Results or children at all', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // no rubric levels for this tenant
      .mockResolvedValueOnce({}) // UPDATE
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });

    const status = await recomputeObjectiveStatus(client, 't1', 'obj-1');
    expect(status).toBe('Not Started');
    expect(client.query).toHaveBeenCalledTimes(3);
  });
});

describe('recomputeObjectiveStatus — own Key Results only, no children', () => {
  it('returns "Not Started" with no Key Results and no children', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: [] }) // own Key Results — none
      .mockResolvedValueOnce({ rows: [] }) // children — none
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });

    const status = await recomputeObjectiveStatus(client, 't1', 'obj-1');
    expect(status).toBe('Not Started');
  });

  it('returns "Not Started" when Key Results exist but none have a Check-in yet', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: [] }) // LATERAL join drops KRs with no Check-in — none scored
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });

    const status = await recomputeObjectiveStatus(client, 't1', 'obj-1');
    expect(status).toBe('Not Started');
  });

  it('computes the weighted average of its own Key Results and rounds to the nearest rubric level', async () => {
    // weighting 1 at level 3 ("On Track"), weighting 1 at level 1 ("Off Track")
    // weighted average = (1*3 + 1*1) / 2 = 2 -> "At Risk"
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: [{ weighting: '1', level_index: 3 }, { weighting: '1', level_index: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });

    const status = await recomputeObjectiveStatus(client, 't1', 'obj-1');
    expect(status).toBe('At Risk');
    const updateCall = client.query.mock.calls[3];
    expect(updateCall[1]).toEqual(['t1', 'obj-1', 'At Risk', 2, 2]); // + coverage: 2 of 2 Key Results reporting
  });

  it('weights Key Results unevenly, not just averaging their raw scores', async () => {
    // weighting 3 at level 4 ("Achieved"), weighting 1 at level 1 ("Off Track")
    // weighted average = (3*4 + 1*1) / 4 = 3.25 -> "On Track"
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: [{ weighting: '3', level_index: 4 }, { weighting: '1', level_index: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });

    const status = await recomputeObjectiveStatus(client, 't1', 'obj-1');
    expect(status).toBe('On Track');
  });
});

describe('recomputeObjectiveStatus — children only, no own Key Results', () => {
  it('averages child Objective statuses equally, ignoring children still "Not Started"', async () => {
    // Children: "Achieved" (4), "Off Track" (1), "Not Started" (excluded)
    // average = (4 + 1) / 2 = 2.5 -> tie between 2 and 3; closestLevel keeps the lower -> "At Risk"
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: [] }) // no own Key Results
      .mockResolvedValueOnce({ rows: [{ status: 'Achieved' }, { status: 'Off Track' }, { status: 'Not Started' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });

    const status = await recomputeObjectiveStatus(client, 't1', 'parent-obj');
    expect(status).toBe('At Risk');
  });

  it('returns "Not Started" when every child is itself "Not Started"', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'Not Started' }, { status: 'Not Started' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });

    const status = await recomputeObjectiveStatus(client, 't1', 'parent-obj');
    expect(status).toBe('Not Started');
  });
});

describe('recomputeObjectiveStatus — own Key Results AND children combined (the 2026-09-23 fix)', () => {
  it('no longer discards its own Key Results just because it also has a child Objective', async () => {
    // Own Key Results: weighting 1 @ level 3, weighting 1 @ level 1 -> own average = 2
    // One child at "Achieved" (level 4)
    // Combined: (2 + 4) / 2 = 3 -> exactly "On Track"
    // Before the fix, this Objective would have scored from the child ALONE
    // (ignoring its own Key Results entirely) — this is the exact shape of
    // the real bug: a Company Objective with checked-in Key Results of its
    // own, plus a Division child, stuck at "Not Started".
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: [{ weighting: '1', level_index: 3 }, { weighting: '1', level_index: 1 }] })
      .mockResolvedValueOnce({ rows: [{ status: 'Achieved' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });

    const status = await recomputeObjectiveStatus(client, 't1', 'obj-1');
    expect(status).toBe('On Track');
    const updateCall = client.query.mock.calls[3];
    expect(updateCall[1]).toEqual(['t1', 'obj-1', 'On Track', 3, 3]); // 2 Key Results + 1 child, all reporting
  });

  it('scores from its own Key Results when its only child is "Not Started" — but capped below Achieved', async () => {
    // Own average = level 4 ("Achieved"); the child is excluded from the
    // average (still "Not Started"), but its existence blocks completion
    // (2026-09-24 completion gate) — so "On Track", not "Achieved".
    // This is the exact shape Mark hit live: Team Achieved over an
    // Individual child that hadn't started.
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: [{ weighting: '1', level_index: 4 }] })
      .mockResolvedValueOnce({ rows: [{ status: 'Not Started' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });

    const status = await recomputeObjectiveStatus(client, 't1', 'obj-1');
    expect(status).toBe('On Track');
  });
});

describe('recomputeObjectiveStatus — cascades upward to the parent Objective', () => {
  it('recomputes the parent too, not just the Objective that was passed in', async () => {
    const client = mockClient();
    client.query
      // --- pass 1: child-obj (its own Key Results only, no children of its own) ---
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: [{ weighting: '1', level_index: 4 }] }) // one scored KR -> "Achieved"
      .mockResolvedValueOnce({ rows: [] }) // no children of child-obj
      .mockResolvedValueOnce({}) // UPDATE child-obj
      .mockResolvedValueOnce({ rows: [{ parentId: 'parent-obj' }] }) // has a parent -> cascade
      // --- pass 2: parent-obj (recursive call; no own Key Results, one child) ---
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: [] }) // parent has no own Key Results
      .mockResolvedValueOnce({ rows: [{ status: 'Achieved' }] }) // parent's children (just the one)
      .mockResolvedValueOnce({}) // UPDATE parent-obj
      .mockResolvedValueOnce({ rows: [{ parentId: null }] }); // parent has no parent -> cascade stops

    await recomputeObjectiveStatus(client, 't1', 'child-obj');

    // 10 total queries across both passes — proves the recursive call actually happened
    expect(client.query).toHaveBeenCalledTimes(10);
    const parentUpdateCall = client.query.mock.calls[8];
    expect(parentUpdateCall[1]).toEqual(['t1', 'parent-obj', 'Achieved', 1, 1]);
  });
});

describe('recomputeObjectiveStatus — completion gate (2026-09-24)', () => {
  function run(ownKeyResults, children) {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: ownKeyResults })
      .mockResolvedValueOnce({ rows: children })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });
    return recomputeObjectiveStatus(client, 't1', 'obj-1');
  }

  it('an un-checked-in Key Result blocks Achieved even when every checked-in one is Achieved', async () => {
    expect(await run([{ weighting: '1', level_index: 4 }, { weighting: '1', level_index: null }], [])).toBe('On Track');
  });

  it('an un-checked-in Key Result is still excluded from the average (does not drag it down)', async () => {
    // Scored KR at On Track (3) + an unscored one -> average stays 3, not pulled towards Off Track
    expect(await run([{ weighting: '1', level_index: 3 }, { weighting: '5', level_index: null }], [])).toBe('On Track');
  });

  it('reaches Achieved only when every Key Result and every child is Achieved', async () => {
    expect(await run([{ weighting: '2', level_index: 4 }, { weighting: '1', level_index: 4 }], [{ status: 'Achieved' }, { status: 'Achieved' }])).toBe('Achieved');
  });

  it('caps an average that rounds to Achieved when one child is only On Track', async () => {
    // Own Achieved (4) + children 4, 4, 3 -> average 3.75 rounds to Achieved; capped to On Track
    expect(await run([{ weighting: '1', level_index: 4 }], [{ status: 'Achieved' }, { status: 'Achieved' }, { status: 'On Track' }])).toBe('On Track');
  });

  it('does not lift a genuinely poor average — the cap only ever lowers the top level', async () => {
    expect(await run([{ weighting: '1', level_index: 1 }], [{ status: 'Not Started' }])).toBe('Off Track');
  });

  it('with no checked-in Key Results and every child Not Started, stays Not Started', async () => {
    expect(await run([{ weighting: '1', level_index: null }], [{ status: 'Not Started' }])).toBe('Not Started');
  });

  it('children-only parent whose children are all Achieved reaches Achieved', async () => {
    expect(await run([], [{ status: 'Achieved' }, { status: 'Achieved' }])).toBe('Achieved');
  });
});

describe('recomputeTenantStatuses', () => {
  it('recomputes every Key Result first, then cascades up from every leaf Objective', async () => {
    const client = { query: vi.fn(async (sql) => {
      if (sql.includes('SELECT id FROM okr.key_result')) return { rows: [{ id: 'kr-1' }] };
      if (sql.includes('NOT EXISTS')) return { rows: [{ id: 'leaf-1' }] };
      if (sql.includes('FROM okr.check_in ci') && sql.includes('LIMIT 1') && !sql.includes('LATERAL')) return { rows: [{ label: 'Achieved' }] };
      if (sql.includes('okr.rubric_level rl') && sql.includes('scoring_rubric')) return { rows: RUBRIC_LEVELS };
      if (sql.includes('LATERAL')) return { rows: [{ weighting: '1', level_index: 4 }] };
      if (sql.includes('parent_objective_id = $2')) return { rows: [] };
      if (sql.includes('parent_objective_id AS "parentId"')) return { rows: [{ parentId: null }] };
      return { rows: [] };
    }) };

    const result = await recomputeTenantStatuses(client, 't1');
    expect(result).toEqual({ keyResults: 1, leafObjectives: 1 });
    const updates = client.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE'));
    expect(updates[0][0]).toContain('okr.key_result');
    expect(updates[0][1]).toEqual(['t1', 'kr-1', 'Achieved']);
    expect(updates[1][0]).toContain('okr.objective');
    expect(updates[1][1]).toEqual(['t1', 'leaf-1', 'Achieved', 1, 1]);
  });
});

describe('recomputeObjectiveStatus — coverage written alongside status (2026-09-25)', () => {
  it('counts each Key Result and each child separately: 1 of 2 Key Results + 0 of 1 child = 1 of 3', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: [{ weighting: '1', level_index: 4 }, { weighting: '1', level_index: null }] })
      .mockResolvedValueOnce({ rows: [{ status: 'Not Started' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });
    await recomputeObjectiveStatus(client, 't1', 'obj-1');
    expect(client.query.mock.calls[3][1]).toEqual(['t1', 'obj-1', 'On Track', 1, 3]);
  });

  it('an Objective with nothing under it records 0 of 0', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });
    await recomputeObjectiveStatus(client, 't1', 'obj-1');
    expect(client.query.mock.calls[3][1]).toEqual(['t1', 'obj-1', 'Not Started', 0, 0]);
  });
});
