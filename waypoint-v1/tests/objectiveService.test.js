import { describe, it, expect, vi } from 'vitest';
import {
  createObjective, updateObjective, getObjectiveForCaller, computeObjectiveStatus,
  ForbiddenError, NotFoundError, ValidationError,
} from '../frontend/api-lib/services/objectiveService.js';

function mockClient() {
  return { query: vi.fn() };
}

// ---------- FR-024: Objective with no Key Results / all-"Not Started" ----------
describe('computeObjectiveStatus (FR-024 edge cases)', () => {
  it('returns "Not Started" for an Objective with no Key Results', () => {
    expect(computeObjectiveStatus([])).toBe('Not Started');
  });

  it('returns "Not Started" when every Key Result is still "Not Started"', () => {
    expect(computeObjectiveStatus(['Not Started', 'Not Started'])).toBe('Not Started');
  });

  it('does not silently fabricate a rubric-level roll-up before Check-ins exist (Module 3)', () => {
    expect(() => computeObjectiveStatus(['On Track', 'Not Started'])).toThrow(/Module 3/);
  });
});

// ---------- FR-015 / role authorisation ----------
describe('createObjective — validation and authorisation', () => {
  it('rejects a caller who is not Manager or Employee', async () => {
    const caller = { id: 'u1', role: 'TenantAdmin' };
    await expect(createObjective(mockClient(), 't1', caller, { title: 'X', cascadeLevelId: 'cl1' }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a missing title', async () => {
    const caller = { id: 'u1', role: 'Employee' };
    await expect(createObjective(mockClient(), 't1', caller, { cascadeLevelId: 'cl1' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a missing cascadeLevelId', async () => {
    const caller = { id: 'u1', role: 'Employee' };
    await expect(createObjective(mockClient(), 't1', caller, { title: 'X' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an Employee trying to own an Objective for someone else', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'other-user', managerId: 'someone-else' }] }); // owner lookup
    const caller = { id: 'u1', role: 'Employee' };
    await expect(createObjective(client, 't1', caller, { title: 'X', cascadeLevelId: 'cl1', ownerId: 'other-user' }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows a Manager to create an Objective owned by their direct report', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'report-1', managerId: 'mgr-1' }] }) // owner lookup — report's manager is the caller
      .mockResolvedValueOnce({ rows: [{ id: 'cl1' }] }) // cascade level exists
      .mockResolvedValueOnce({ rows: [{ id: 'cycle-1' }] }) // active cycle
      .mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'report-1', status: 'Not Started' }] }); // insert

    const caller = { id: 'mgr-1', role: 'Manager' };
    const objective = await createObjective(client, 't1', caller, { title: 'X', cascadeLevelId: 'cl1', ownerId: 'report-1' });
    expect(objective.ownerId).toBe('report-1');
    expect(objective.status).toBe('Not Started');
  });

  it('creates a self-owned Objective in the tenant\'s active Cycle, defaulting status to "Not Started"', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'cl1' }] }) // cascade level exists (no owner lookup — self-owned)
      .mockResolvedValueOnce({ rows: [{ id: 'cycle-1' }] }) // active cycle
      .mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', status: 'Not Started' }] }); // insert

    const caller = { id: 'u1', role: 'Employee' };
    const objective = await createObjective(client, 't1', caller, { title: 'Grow revenue', cascadeLevelId: 'cl1' });
    expect(objective.status).toBe('Not Started');
    expect(client.query).toHaveBeenCalledTimes(3);
  });

  it('rejects when the tenant has no active Cycle (FR-014/FR-015)', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'cl1' }] }) // cascade level exists
      .mockResolvedValueOnce({ rows: [] }); // no active cycle

    const caller = { id: 'u1', role: 'Employee' };
    await expect(createObjective(client, 't1', caller, { title: 'X', cascadeLevelId: 'cl1' }))
      .rejects.toThrow(/active Cycle/);
  });
});

// ---------- FR-020: visibility ----------
describe('getObjectiveForCaller (FR-020: owner + owner\'s direct Manager only)', () => {
  it('throws NotFoundError when the Objective does not exist in this tenant', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(getObjectiveForCaller(client, 't1', 'obj-x', { id: 'u1' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('is visible to its owner', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: 'mgr-1' }] });
    const objective = await getObjectiveForCaller(client, 't1', 'obj-1', { id: 'u1' });
    expect(objective.id).toBe('obj-1');
    expect(objective.ownerManagerId).toBeUndefined(); // internal-only field stripped before returning
  });

  it('is visible to the owner\'s direct Manager', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: 'mgr-1' }] });
    const objective = await getObjectiveForCaller(client, 't1', 'obj-1', { id: 'mgr-1' });
    expect(objective.id).toBe('obj-1');
  });

  it('is forbidden to an unrelated user', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: 'mgr-1' }] });
    await expect(getObjectiveForCaller(client, 't1', 'obj-1', { id: 'someone-else' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ---------- FR-023: no cascade cycle ----------
describe('updateObjective (FR-023: no cascade cycle)', () => {
  it('rejects reparenting an Objective under its own descendant', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'obj-A', ownerId: 'u1', ownerManagerId: null, cascadeLevelId: 'cl2', title: 'A', parentObjectiveId: null }] }) // fetch existing (obj-A)
      .mockResolvedValueOnce({ rows: [{ id: 'obj-B', parentLevelIndex: 1, childLevelIndex: 2 }] }) // parent-is-one-level-above check
      .mockResolvedValueOnce({ rows: [{ parent_objective_id: 'obj-A' }] }); // walking up from obj-B: its parent is obj-A itself → cycle

    await expect(
      updateObjective(client, 't1', { id: 'u1' }, 'obj-A', { parentObjectiveId: 'obj-B' })
    ).rejects.toThrow(/FR-023/);
  });

  it('allows reparenting to an Objective that is genuinely one level above with no cycle', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'obj-A', ownerId: 'u1', ownerManagerId: null, cascadeLevelId: 'cl2', title: 'A', parentObjectiveId: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'obj-C', parentLevelIndex: 1, childLevelIndex: 2 }] }) // one level above — valid
      .mockResolvedValueOnce({ rows: [{ parent_objective_id: null }] }) // obj-C has no further parent — no cycle
      .mockResolvedValueOnce({ rows: [{ id: 'obj-A', title: 'A', parentObjectiveId: 'obj-C' }] }); // update

    const updated = await updateObjective(client, 't1', { id: 'u1' }, 'obj-A', { parentObjectiveId: 'obj-C' });
    expect(updated.parentObjectiveId).toBe('obj-C');
  });

  it('rejects a caller who is neither the owner nor the owner\'s Manager', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'obj-A', ownerId: 'u1', ownerManagerId: 'mgr-1', title: 'A' }] });
    await expect(updateObjective(client, 't1', { id: 'stranger' }, 'obj-A', { title: 'New title' }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });
});
