/**
 * FR-030 — "A Tenant Administrator can export their organisation's full
 * OKR data (Objectives, Key Results, Initiatives, Check-ins,
 * Reflections, Cycles) as CSV or JSON. A Platform Administrator can do
 * the same for any tenant." Access control lives in the router
 * (tenants-router.js) — this module assumes tenantId has already been
 * authorised for the caller and just reads it.
 *
 * Column lists are explicit, matching db/schema.sql exactly, rather than
 * SELECT * — this keeps the CSV header row correct even for a
 * zero-row tenant, and makes a schema drift (see status.md's note on
 * schema.sql going stale earlier this project) visibly break an export
 * instead of silently changing its shape.
 *
 * Kai's Stage 2 review flagged bulk export as a standing security-review
 * item needing streaming/pagination for a large dataset (section 9). At
 * current scale (Stage 2 §7.1 sizing: tens to low hundreds of rows per
 * tenant) a single in-memory query set per entity is proportionate; this
 * does not hold if a tenant grows to many thousands of rows without
 * revisiting it.
 */
import JSZip from 'jszip';
import { rowsToCsv } from '../csv.js';

const ENTITIES = [
  {
    key: 'objectives', table: 'objective', orderBy: 'created_at',
    columns: ['id', 'cycle_id', 'cascade_level_id', 'parent_objective_id', 'owner_id', 'title', 'status', 'created_at'],
  },
  {
    key: 'keyResults', table: 'key_result', orderBy: 'created_at',
    columns: ['id', 'objective_id', 'rubric_id', 'title', 'weighting', 'status', 'created_at'],
  },
  {
    key: 'initiatives', table: 'initiative', orderBy: 'created_at',
    columns: ['id', 'key_result_id', 'owner_id', 'title', 'status', 'due_date', 'created_at'],
  },
  {
    key: 'checkIns', table: 'check_in', orderBy: 'submitted_at',
    columns: ['id', 'key_result_id', 'submitted_by_id', 'rubric_level_id', 'confidence', 'comment', 'submitted_at'],
  },
  {
    key: 'reflections', table: 'reflection', orderBy: 'submitted_at',
    columns: ['id', 'objective_id', 'author_id', 'content', 'submitted_at'],
  },
  {
    key: 'cycles', table: 'cycle', orderBy: 'created_at',
    columns: ['id', 'cadence_id', 'name', 'start_date', 'end_date', 'created_at'],
  },
];

/** Runs the six per-entity queries and returns { objectives, keyResults, ... }. */
export async function exportTenantData(client, tenantId) {
  const data = {};
  for (const entity of ENTITIES) {
    const { rows } = await client.query(
      `SELECT ${entity.columns.join(', ')} FROM okr.${entity.table} WHERE tenant_id = $1 ORDER BY ${entity.orderBy}`,
      [tenantId]
    );
    data[entity.key] = rows;
  }
  return data;
}

/** JSON.stringify with a stable key order matching FR-030's own listing order. */
export function formatExportAsJson(data) {
  return JSON.stringify(
    {
      objectives: data.objectives, keyResults: data.keyResults, initiatives: data.initiatives,
      checkIns: data.checkIns, reflections: data.reflections, cycles: data.cycles,
    },
    null,
    2
  );
}

/** One CSV per entity, zipped together — a single CSV can't hold six different shapes. */
export async function formatExportAsCsvZip(data) {
  const zip = new JSZip();
  for (const entity of ENTITIES) {
    zip.file(`${entity.key}.csv`, rowsToCsv(entity.columns, data[entity.key]));
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
