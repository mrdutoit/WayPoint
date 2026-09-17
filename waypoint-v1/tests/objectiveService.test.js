import { describe, it, expect, vi } from 'vitest';
import {
  createObjective, updateObjective, getObjectiveForCaller, listObjectivesForCaller,
  ForbiddenError, NotFoundError, ValidationError,
} from '../frontend/api-lib/services/objectiveService.js';

function mockClient() {
  return { query: vi.fn() };
}

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
      .rejects.toThrow(/Cycle covers today/);
  });
});

// ---------- FR-020: visibility (broadened at Mark's direction — see
// objectiveService.js's module comment) ----------
describe('getObjectiveForCaller — visible tenant-wide, canEdit reflects the narrower owner+Manager rule', () => {
  it('throws NotFoundError when the Objective does not exist in this tenant', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(getObjectiveForCaller(client, 't1', 'obj-x', { id: 'u1' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('is visible to its owner, with canEdit true', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: 'mgr-1' }] });
    const objective = await getObjectiveForCaller(client, 't1', 'obj-1', { id: 'u1' });
    expect(objective.id).toBe('obj-1');
    expect(objective.canEdit).toBe(true);
    expect(objective.ownerManagerId).toBeUndefined(); // internal-only field stripped before returning
  });

  it('is visible to the owner\'s direct Manager, with canEdit true', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: 'mgr-1' }] });
    const objective = await getObjectiveForCaller(client, 't1', 'obj-1', { id: 'mgr-1' });
    expect(objective.id).toBe('obj-1');
    expect(objective.canEdit).toBe(true);
  });

  it('is now ALSO visible to an unrelated tenant member, but with canEdit false', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'obj-1', ownerId: 'u1', ownerManagerId: 'mgr-1' }] });
    const objective = await getObjectiveForCaller(client, 't1', 'obj-1', { id: 'someone-else' });
    expect(objective.id).toBe('obj-1');
    expect(objective.canEdit).toBe(false);
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

// ---------- cascade level move (2026-09-17, resolves the previously-open
// "should this be editable" design question) ----------
describe('updateObjective — moving an Objective to a different cascade level', () => {
  it('rejects the move while the Objective has children, naming them', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'obj-A', ownerId: 'u1', ownerManagerId: null, cascadeLevelId: 'cl2', title: 'A', parentObjectiveId: null }] }) // fetch existing
      .mockResolvedValueOnce({ rows: [{ id: 'cl3' }] }) // new level exists
      .mockResolvedValueOnce({ rows: [{ title: 'Child One' }, { title: 'Child Two' }] }); // has children

    await expect(
      updateObjective(client, 't1', { id: 'u1' }, 'obj-A', { cascadeLevelId: 'cl3' })
    ).rejects.toThrow(/Child One.*Child Two/s);
  });

  it('rejects a cascadeLevelId that does not exist in this tenant', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'obj-A', ownerId: 'u1', ownerManagerId: null, cascadeLevelId: 'cl2', title: 'A', parentObjectiveId: null }] })
      .mockResolvedValueOnce({ rows: [] }); // level lookup — not found

    await expect(
      updateObjective(client, 't1', { id: 'u1' }, 'obj-A', { cascadeLevelId: 'nonexistent' })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('auto-detaches the parent when it no longer fits the new level, rather than erroring or leaving it invalid', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'obj-A', ownerId: 'u1', ownerManagerId: null, cascadeLevelId: 'cl2', title: 'A', parentObjectiveId: 'obj-parent' }] }) // fetch existing — has a parent
      .mockResolvedValueOnce({ rows: [{ id: 'cl4' }] }) // new level exists
      .mockResolvedValueOnce({ rows: [] }) // no children
      .mockResolvedValueOnce({ rows: [{ id: 'obj-parent', parentLevelIndex: 1, childLevelIndex: 4 }] }) // assertParentIsOneLevelAbove probe against the NEW level (index 4): parent sits at index 1, needs index 3 to fit — doesn't, so this throws and is caught
      .mockResolvedValueOnce({ rows: [{ id: 'obj-A', title: 'A', cascadeLevelId: 'cl4', parentObjectiveId: null }] }); // update — parent cleared

    const updated = await updateObjective(client, 't1', { id: 'u1' }, 'obj-A', { cascadeLevelId: 'cl4' });
    expect(updated.parentObjectiveId).toBe(null);
    // confirms the final UPDATE was reached with a cleared parent, not that
    // assertParentIsOneLevelAbove's internal arithmetic was exercised here —
    // that arithmetic already has its own coverage in the FR-023 block above.
  });

  it('allows the move when there are no children and no parent to reconcile', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'obj-A', ownerId: 'u1', ownerManagerId: null, cascadeLevelId: 'cl2', title: 'A', parentObjectiveId: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'cl4' }] })
      .mockResolvedValueOnce({ rows: [] }) // no children
      .mockResolvedValueOnce({ rows: [{ id: 'obj-A', title: 'A', cascadeLevelId: 'cl4' }] }); // update

    const updated = await updateObjective(client, 't1', { id: 'u1' }, 'obj-A', { cascadeLevelId: 'cl4' });
    expect(updated.cascadeLevelId).toBe('cl4');
  });
});

describe('listObjectivesForCaller — tenant-wide, not scoped to owner/reports', () => {
  it('returns every Objective in the tenant regardless of who owns it, with owner names', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({
      rows: [
        { id: 'obj-1', ownerId: 'someone-else', ownerFirstName: 'Ada', ownerLastName: 'Lovelace' },
        { id: 'obj-2', ownerId: 'u1', ownerFirstName: 'Bob', ownerLastName: 'Smith' },
      ],
    });
    const objectives = await listObjectivesForCaller(client, 't1', { id: 'u1' });
    expect(objectives).toHaveLength(2);
    expect(objectives[0].ownerFirstName).toBe('Ada'); // visible even though owned by "someone-else", not the caller
  });
});
