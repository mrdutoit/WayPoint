import { ValidationError } from './errors.js';

/**
 * Cascade levels (FR-012): a TenantAdmin configures between one and four
 * levels and can rename each one's label. Reconfiguration upserts rows by
 * level_index rather than delete-and-recreate, so existing
 * okr.objective.cascade_level_id references never dangle when only a
 * label changes. Shrinking the level count is only allowed down to the
 * lowest index that no Objective currently references — see
 * removeLevelsAbove below.
 */

export async function getCascadeLevelsForTenant(client, tenantId) {
  const { rows } = await client.query(
    `SELECT id, level_index, label
     FROM okr.cascade_level
     WHERE tenant_id = $1
     ORDER BY level_index ASC`,
    [tenantId]
  );
  return rows;
}

export class CascadeLevelInUseError extends Error {
  constructor(levelIndex) {
    super(`Cascade level ${levelIndex} still has Objectives linked to it — reassign or remove them before removing this level.`);
    this.name = 'CascadeLevelInUseError';
    this.levelIndex = levelIndex;
  }
}

/**
 * Replaces the tenant's cascade level set with `labels` (array of 1-4
 * strings, index 0 = level 1 = top of the cascade). Existing levels are
 * updated in place by level_index; any level being removed (the new
 * array is shorter than the old one) is checked for Objective references
 * first and rejected with CascadeLevelInUseError if any exist, rather
 * than failing on the FK constraint with a less useful message.
 */
export async function setCascadeLevelsForTenant(client, tenantId, labels) {
  if (!Array.isArray(labels) || labels.length < 1 || labels.length > 4) {
    throw new ValidationError('labels must be an array of 1 to 4 strings');
  }
  if (labels.some((l) => typeof l !== 'string' || !l.trim())) {
    throw new ValidationError('every cascade level label must be a non-empty string');
  }

  const { rows: existing } = await client.query(
    `SELECT level_index FROM okr.cascade_level WHERE tenant_id = $1 ORDER BY level_index ASC`,
    [tenantId]
  );
  const removedIndexes = existing
    .map((r) => r.level_index)
    .filter((idx) => idx > labels.length);

  for (const levelIndex of removedIndexes) {
    const { rows: inUse } = await client.query(
      `SELECT 1 FROM okr.objective o
       JOIN okr.cascade_level cl ON cl.id = o.cascade_level_id
       WHERE cl.tenant_id = $1 AND cl.level_index = $2
       LIMIT 1`,
      [tenantId, levelIndex]
    );
    if (inUse.length > 0) throw new CascadeLevelInUseError(levelIndex);
  }

  for (let i = 0; i < labels.length; i++) {
    const levelIndex = i + 1;
    await client.query(
      `INSERT INTO okr.cascade_level (id, tenant_id, level_index, label)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (tenant_id, level_index)
       DO UPDATE SET label = EXCLUDED.label`,
      [tenantId, levelIndex, labels[i].trim()]
    );
  }
  if (removedIndexes.length > 0) {
    await client.query(
      `DELETE FROM okr.cascade_level WHERE tenant_id = $1 AND level_index > $2`,
      [tenantId, labels.length]
    );
  }
  await client.query(
    `UPDATE okr.tenant SET cascade_level_count = $2 WHERE id = $1`,
    [tenantId, labels.length]
  );

  return getCascadeLevelsForTenant(client, tenantId);
}
