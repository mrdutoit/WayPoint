import { ValidationError } from './errors.js';

/**
 * OKR element configuration (FR-025). Pulled forward from Module 7 at
 * Mark's request while testing Module 2 — "delivering the functionality
 * they're surrounded by."
 *
 * Dependency graph, from the Stage 2 doc section 3.1:
 *   Objective  — base unit, always enabled, can never be disabled
 *   KeyResult  — requires Objective
 *   Initiative — requires KeyResult
 *   CheckIn    — requires KeyResult
 *   Reflection — requires Objective (independent of KeyResult)
 *
 * One resolved ambiguity between section 3.1's table and FR-025's own
 * text, worth flagging rather than silently picking: the table says
 * disabling Key Result "automatically switches off Initiative and
 * Check-in" (sounds like a cascade), but FR-025 itself says disabling an
 * element another *enabled* element depends on "is rejected server-side
 * with an error naming the dependent element(s)" (no auto-cascade at
 * all). Implemented per FR-025's literal, fully-specified text — reject,
 * don't cascade — since that's the version with a defined mechanism;
 * the table read is treated as a looser gloss of the same rule. Flag if
 * auto-cascade was actually intended.
 *
 * Enabling an element auto-enables its prerequisite chain (this part is
 * unambiguous in both places) — enabling Initiative with Objective and
 * KeyResult both currently off enables all three in one call.
 */

export const ALL_ELEMENTS = ['Objective', 'KeyResult', 'Initiative', 'CheckIn', 'Reflection'];

const PREREQUISITE = {
  Objective: null,
  KeyResult: 'Objective',
  Initiative: 'KeyResult',
  CheckIn: 'KeyResult',
  Reflection: 'Objective',
};
const DEPENDENTS = {
  Objective: ['KeyResult', 'Reflection'],
  KeyResult: ['Initiative', 'CheckIn'],
  Initiative: [],
  CheckIn: [],
  Reflection: [],
};

export async function getElementConfigForTenant(client, tenantId) {
  const { rows } = await client.query(
    `SELECT element_key AS "elementKey", is_enabled AS "isEnabled" FROM okr.okr_element_config WHERE tenant_id = $1`,
    [tenantId]
  );
  const map = Object.fromEntries(ALL_ELEMENTS.map((k) => [k, true])); // default true for any not-yet-seeded element
  for (const row of rows) map[row.elementKey] = row.isEnabled;
  return map;
}

/**
 * Is `elementKey` enabled for this tenant? Used by other services (e.g.
 * keyResultService.js) to gate creation without each call site
 * re-deriving the default-true fallback.
 */
export async function isElementEnabled(client, tenantId, elementKey) {
  const config = await getElementConfigForTenant(client, tenantId);
  return config[elementKey] !== false;
}

async function upsertElement(client, tenantId, elementKey, isEnabled) {
  await client.query(
    `INSERT INTO okr.okr_element_config (id, tenant_id, element_key, is_enabled)
     VALUES (gen_random_uuid(), $1, $2, $3)
     ON CONFLICT (tenant_id, element_key) DO UPDATE SET is_enabled = EXCLUDED.is_enabled`,
    [tenantId, elementKey, isEnabled]
  );
}

export async function setElementEnabled(client, tenantId, elementKey, isEnabled) {
  if (!ALL_ELEMENTS.includes(elementKey)) throw new ValidationError(`Unknown OKR element: ${elementKey}`);
  if (elementKey === 'Objective' && !isEnabled) {
    throw new ValidationError('Objective is the base unit and can never be disabled (FR-025)');
  }

  const current = await getElementConfigForTenant(client, tenantId);

  if (isEnabled) {
    const toEnable = [elementKey];
    let key = PREREQUISITE[elementKey];
    while (key) {
      if (!current[key]) toEnable.unshift(key);
      key = PREREQUISITE[key];
    }
    for (const k of toEnable) await upsertElement(client, tenantId, k, true);
  } else {
    const enabledDependents = DEPENDENTS[elementKey].filter((d) => current[d]);
    if (enabledDependents.length > 0) {
      throw new ValidationError(
        `Cannot disable ${elementKey} while ${enabledDependents.join(' and ')} still enabled — disable ${enabledDependents.join(' and ')} first (FR-025)`
      );
    }
    await upsertElement(client, tenantId, elementKey, false);
  }

  return getElementConfigForTenant(client, tenantId);
}
