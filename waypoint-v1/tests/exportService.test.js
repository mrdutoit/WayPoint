import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { exportTenantData, formatExportAsJson, formatExportAsCsvZip } from '../frontend/api-lib/services/exportService.js';

function mockClient(perEntityRows) {
  const query = vi.fn();
  for (const rows of perEntityRows) query.mockResolvedValueOnce({ rows });
  return { query };
}

// Order must match exportService.js's ENTITIES array — objectives,
// keyResults, initiatives, checkIns, reflections, cycles.
const EMPTY_TENANT = [[], [], [], [], [], []];

describe('exportTenantData', () => {
  it('queries all six entity tables and groups results under their camelCase keys, in FR-030\'s listed order', async () => {
    const client = mockClient([
      [{ id: 'o1', title: 'Grow revenue' }], // objectives
      [{ id: 'k1', title: 'Sign 10 clients' }], // keyResults
      [{ id: 'i1', title: 'Run campaign' }], // initiatives
      [{ id: 'c1', confidence: 4 }], // checkIns
      [{ id: 'r1', content: 'Went well' }], // reflections
      [{ id: 'cy1', name: 'Q3 2026' }], // cycles
    ]);

    const data = await exportTenantData(client, 't1');

    expect(data.objectives).toEqual([{ id: 'o1', title: 'Grow revenue' }]);
    expect(data.keyResults).toEqual([{ id: 'k1', title: 'Sign 10 clients' }]);
    expect(data.initiatives).toEqual([{ id: 'i1', title: 'Run campaign' }]);
    expect(data.checkIns).toEqual([{ id: 'c1', confidence: 4 }]);
    expect(data.reflections).toEqual([{ id: 'r1', content: 'Went well' }]);
    expect(data.cycles).toEqual([{ id: 'cy1', name: 'Q3 2026' }]);
    expect(client.query).toHaveBeenCalledTimes(6);
  });

  it('every query is scoped to the given tenantId', async () => {
    const client = mockClient(EMPTY_TENANT);
    await exportTenantData(client, 'tenant-xyz');
    for (const call of client.query.mock.calls) {
      expect(call[1]).toEqual(['tenant-xyz']);
    }
  });

  it('returns empty arrays, not an error, for a tenant with no data yet', async () => {
    const client = mockClient(EMPTY_TENANT);
    const data = await exportTenantData(client, 't1');
    expect(Object.values(data).every((rows) => Array.isArray(rows) && rows.length === 0)).toBe(true);
  });
});

describe('formatExportAsJson', () => {
  it('produces valid, pretty-printed JSON with the six entities as top-level keys', () => {
    const data = { objectives: [{ id: 'o1' }], keyResults: [], initiatives: [], checkIns: [], reflections: [], cycles: [] };
    const json = formatExportAsJson(data);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(Object.keys(parsed)).toEqual(['objectives', 'keyResults', 'initiatives', 'checkIns', 'reflections', 'cycles']);
    expect(parsed.objectives).toEqual([{ id: 'o1' }]);
    expect(json).toContain('\n'); // pretty-printed, not minified
  });
});

describe('formatExportAsCsvZip', () => {
  it('produces a real zip archive with one correctly-named CSV per entity, round-trippable through JSZip', async () => {
    const data = {
      objectives: [{ id: 'o1', cycle_id: 'c1', cascade_level_id: 'cl1', parent_objective_id: null, owner_id: 'u1', title: 'Grow revenue', status: 'On Track', created_at: '2026-09-01' }],
      keyResults: [],
      initiatives: [],
      checkIns: [],
      reflections: [],
      cycles: [],
    };

    const buffer = await formatExportAsCsvZip(data);
    expect(Buffer.isBuffer(buffer)).toBe(true);

    const unzipped = await JSZip.loadAsync(buffer);
    const filenames = Object.keys(unzipped.files).sort();
    expect(filenames).toEqual(['checkIns.csv', 'cycles.csv', 'initiatives.csv', 'keyResults.csv', 'objectives.csv', 'reflections.csv'].sort());

    const objectivesCsv = await unzipped.file('objectives.csv').async('string');
    expect(objectivesCsv).toContain('id,cycle_id,cascade_level_id,parent_objective_id,owner_id,title,status,created_at');
    expect(objectivesCsv).toContain('Grow revenue');

    // A table with no rows still yields a valid header-only CSV inside the zip.
    const cyclesCsv = await unzipped.file('cycles.csv').async('string');
    expect(cyclesCsv).toBe('id,cadence_id,name,start_date,end_date,created_at');
  });
});
