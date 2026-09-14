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

describe('recomputeObjectiveStatus — leaf Objective (no children), scored from own Key Results', () => {
  it('returns "Not Started" with no children and no Key Results at all', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // children lookup — none
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS }) // tenant rubric levels
      .mockResolvedValueOnce({ rows: [] }) // scored Key Results — none
      .mockResolvedValueOnce({}) // UPDATE objective
      .mockResolvedValueOnce({ rows: [{ parentId: null }] }); // no parent — no cascade

    const status = await recomputeObjectiveStatus(client, 't1', 'obj-1');
    expect(status).toBe('Not Started');
  });

  it('returns "Not Started" when Key Results exist but none have a Check-in yet', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // no children
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: [] }) // LATERAL join drops KRs with no Check-in — none scored
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });

    const status = await recomputeObjectiveStatus(client, 't1', 'obj-1');
    expect(status).toBe('Not Started');
  });

  it('computes the weighted average and rounds to the nearest rubric level', async () => {
    const client = mockClient();
    // Two Key Results: weighting 1 at level_index 3 ("On Track"), weighting 1 at level_index 1 ("Off Track")
    // weighted average = (1*3 + 1*1) / 2 = 2 -> nearest level_index 2 -> "At Risk"
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: [{ weighting: '1', level_index: 3 }, { weighting: '1', level_index: 1 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });

    const status = await recomputeObjectiveStatus(client, 't1', 'obj-1');
    expect(status).toBe('At Risk');
    const updateCall = client.query.mock.calls[3];
    expect(updateCall[1]).toEqual(['t1', 'obj-1', 'At Risk']);
  });

  it('weights Key Results unevenly, not just averaging their raw scores', async () => {
    // weighting 3 at level_index 4 ("Achieved"), weighting 1 at level_index 1 ("Off Track")
    // weighted average = (3*4 + 1*1) / 4 = 3.25 -> nearest level_index 3 -> "On Track"
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: [{ weighting: '3', level_index: 4 }, { weighting: '1', level_index: 1 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });

    const status = await recomputeObjectiveStatus(client, 't1', 'obj-1');
    expect(status).toBe('On Track');
  });
});

describe('recomputeObjectiveStatus — parent Objective (has children), scored from child Objectives', () => {
  it('averages child Objective statuses equally, ignoring children still "Not Started"', async () => {
    // Children: "Achieved" (level 4), "Off Track" (level 1), "Not Started" (excluded)
    // average = (4 + 1) / 2 = 2.5 -> nearest is a tie between level 2 and 3; closestLevel keeps the lower on ties -> "At Risk"
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ status: 'Achieved' }, { status: 'Off Track' }, { status: 'Not Started' }] })
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({}) // UPDATE objective
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });

    const status = await recomputeObjectiveStatus(client, 't1', 'parent-obj');
    expect(status).toBe('At Risk');
    // no Key Result query at all — children branch never touches key_result
    const sqlStrings = client.query.mock.calls.map((c) => c[0]);
    expect(sqlStrings.some((sql) => sql.includes('okr.key_result'))).toBe(false);
  });

  it('returns "Not Started" when every child is itself "Not Started"', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ status: 'Not Started' }, { status: 'Not Started' }] })
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ parentId: null }] });

    const status = await recomputeObjectiveStatus(client, 't1', 'parent-obj');
    expect(status).toBe('Not Started');
  });
});

describe('recomputeObjectiveStatus — cascades upward to the parent Objective', () => {
  it('recomputes the parent too, not just the Objective that was passed in', async () => {
    const client = mockClient();
    client.query
      // --- pass 1: child-obj ---
      .mockResolvedValueOnce({ rows: [] }) // no children of child-obj
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({ rows: [{ weighting: '1', level_index: 4 }] }) // one scored KR -> "Achieved"
      .mockResolvedValueOnce({}) // UPDATE child-obj
      .mockResolvedValueOnce({ rows: [{ parentId: 'parent-obj' }] }) // has a parent -> cascade
      // --- pass 2: parent-obj (recursive call) ---
      .mockResolvedValueOnce({ rows: [{ status: 'Achieved' }] }) // parent's children (just the one)
      .mockResolvedValueOnce({ rows: RUBRIC_LEVELS })
      .mockResolvedValueOnce({}) // UPDATE parent-obj
      .mockResolvedValueOnce({ rows: [{ parentId: null }] }); // parent has no parent -> cascade stops

    await recomputeObjectiveStatus(client, 't1', 'child-obj');

    // 9 total queries across both passes — proves the recursive call actually happened
    expect(client.query).toHaveBeenCalledTimes(9);
    const parentUpdateCall = client.query.mock.calls[7];
    expect(parentUpdateCall[1]).toEqual(['t1', 'parent-obj', 'Achieved']);
  });
});
