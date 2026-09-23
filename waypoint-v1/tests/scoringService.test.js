import { describe, it, expect, vi } from 'vitest';
import { recomputeKeyResultStatus, recomputeObjectiveStatus } from '../frontend/api-lib/services/scoringService.js';

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
    expect(updateCall[1]).toEqual(['t1', 'obj-1', 'At Risk']);
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
    expect(updateCall[1]).toEqual(['t1', 'obj-1', 'On Track']);
  });

  it('still scores from its own Key Results alone when its only child is "Not Started"', async () => {
    // Own average = level 4 ("Achieved"); the one child contributes nothing
    // (still "Not Started"), so the combined average is just the own score.
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: [{ weighting: '1', level_index: 4 }] })
      .mockResolvedValueOnce({ rows: [{ status: 'Not Started' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });

    const status = await recomputeObjectiveStatus(client, 't1', 'obj-1');
    expect(status).toBe('Achieved');
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
    expect(parentUpdateCall[1]).toEqual(['t1', 'parent-obj', 'Achieved']);
  });
});
