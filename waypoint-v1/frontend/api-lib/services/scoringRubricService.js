import { ValidationError } from './errors.js';

/**
 * Scoring rubric (FR-017): "A Tenant Administrator defines a scoring
 * rubric of four or five ordered levels... used to score every Key
 * Result in that tenant" — singular, tenant-wide. The schema models
 * scoring_rubric as one-to-many per tenant (matching the Stage 2 ERD),
 * but this service treats it as get-or-create-one, matching FR-017's
 * wording. Flag to Mark if multi-rubric support was actually intended —
 * easy to relax later, harder to retrofit if built the other way first.
 *
 * Default labels (Off Track / At Risk / On Track / Achieved) match
 * frontend/src/styles/tokens.js STATUS_META, already seeded there ahead
 * of this module.
 */

export const DEFAULT_RUBRIC_LEVELS = ['Off Track', 'At Risk', 'On Track', 'Achieved'];

export async function getRubricForTenant(client, tenantId) {
  const { rows: rubrics } = await client.query(
    `SELECT id, name FROM okr.scoring_rubric WHERE tenant_id = $1 ORDER BY id LIMIT 1`,
    [tenantId]
  );
  if (rubrics.length === 0) return null;

  const { rows: levels } = await client.query(
    `SELECT level_index, label FROM okr.rubric_level WHERE rubric_id = $1 ORDER BY level_index ASC`,
    [rubrics[0].id]
  );
  return { id: rubrics[0].id, name: rubrics[0].name, levels };
}

/**
 * Creates the tenant's rubric if none exists, otherwise updates its name
 * and upserts its levels by level_index (same pattern as cascade levels —
 * see cascadeLevelService.js — so existing okr.key_result.rubric_id and
 * okr.check_in.rubric_level_id references, once Check-in ships in Module
 * 3, are never orphaned by a routine relabel).
 */
export async function setRubricForTenant(client, tenantId, { name, levels }) {
  if (!name?.trim()) throw new ValidationError('name is required');
  if (!Array.isArray(levels) || levels.length < 4 || levels.length > 5) {
    throw new ValidationError('levels must be an array of 4 or 5 strings (FR-017)');
  }
  if (levels.some((l) => typeof l !== 'string' || !l.trim())) {
    throw new ValidationError('every rubric level label must be a non-empty string');
  }

  let rubricId;
  const { rows: existing } = await client.query(
    `SELECT id FROM okr.scoring_rubric WHERE tenant_id = $1 ORDER BY id LIMIT 1`,
    [tenantId]
  );
  if (existing.length > 0) {
    rubricId = existing[0].id;
    await client.query(`UPDATE okr.scoring_rubric SET name = $2 WHERE id = $1`, [rubricId, name.trim()]);
  } else {
    const { rows } = await client.query(
      `INSERT INTO okr.scoring_rubric (id, tenant_id, name) VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
      [tenantId, name.trim()]
    );
    rubricId = rows[0].id;
  }

  for (let i = 0; i < levels.length; i++) {
    await client.query(
      `INSERT INTO okr.rubric_level (id, tenant_id, rubric_id, level_index, label)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       ON CONFLICT (rubric_id, level_index)
       DO UPDATE SET label = EXCLUDED.label`,
      [tenantId, rubricId, i + 1, levels[i].trim()]
    );
  }
  await client.query(
    `DELETE FROM okr.rubric_level WHERE rubric_id = $1 AND level_index > $2`,
    [rubricId, levels.length]
  );

  return getRubricForTenant(client, tenantId);
}
