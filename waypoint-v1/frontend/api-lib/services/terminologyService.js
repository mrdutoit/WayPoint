import { ValidationError } from './errors.js';

/**
 * Terminology customisation (FR-013). Pulled forward from Module 7 at
 * Mark's request while testing Module 2.
 *
 * No seeding on tenant creation — absence of a row for a term IS the
 * default state (the standard English label), not something that needs
 * a row to represent. Resetting a term to its default deletes the row
 * rather than storing the default value explicitly, for the same
 * reason.
 *
 * Frontend scope, stated plainly rather than left to be discovered: the
 * custom labels are applied to primary UI surfaces — nav links, page
 * titles, section headers, and the main create/add buttons (App.jsx,
 * Objectives.jsx, ObjectiveDetail.jsx, OkrSettings.jsx) — not to every
 * string in the app. Backend validation-error text (e.g. "cadenceId
 * does not exist") is not substituted; FR-013 says "used throughout
 * that tenant's UI," read here as the UI layer the person actually
 * looks at, not internal error message strings. Plural forms use a
 * plain heuristic (see TerminologyContext.jsx's pluralise()), not a
 * full inflection library — good enough for ordinary business nouns,
 * not guaranteed for every irregular plural.
 */

export const DEFAULT_TERMS = {
  Objective: 'Objective',
  KeyResult: 'Key Result',
  Cycle: 'Cycle',
  CheckIn: 'Check-in',
  Initiative: 'Initiative',
  Reflection: 'Reflection',
};
export const TERM_KEYS = Object.keys(DEFAULT_TERMS);

export async function getTerminologyForTenant(client, tenantId) {
  const { rows } = await client.query(
    `SELECT term_key AS "termKey", custom_label AS "customLabel" FROM okr.terminology_setting WHERE tenant_id = $1`,
    [tenantId]
  );
  const overrides = Object.fromEntries(rows.map((r) => [r.termKey, r.customLabel]));
  return { ...DEFAULT_TERMS, ...overrides };
}

/**
 * `overrides` is a partial map of termKey -> customLabel; only the keys
 * present are touched. A blank/whitespace-only label, or one equal to
 * the default, resets that term to its default (deletes the row) rather
 * than storing a redundant override.
 */
export async function setTerminologyForTenant(client, tenantId, overrides) {
  if (!overrides || typeof overrides !== 'object') throw new ValidationError('overrides must be an object');
  for (const key of Object.keys(overrides)) {
    if (!TERM_KEYS.includes(key)) throw new ValidationError(`Unknown term key: ${key}`);
  }

  for (const [key, label] of Object.entries(overrides)) {
    const trimmed = typeof label === 'string' ? label.trim() : '';
    if (!trimmed || trimmed === DEFAULT_TERMS[key]) {
      await client.query(`DELETE FROM okr.terminology_setting WHERE tenant_id = $1 AND term_key = $2`, [tenantId, key]);
    } else {
      await client.query(
        `INSERT INTO okr.terminology_setting (id, tenant_id, term_key, custom_label)
         VALUES (gen_random_uuid(), $1, $2, $3)
         ON CONFLICT (tenant_id, term_key) DO UPDATE SET custom_label = EXCLUDED.custom_label`,
        [tenantId, key, trimmed]
      );
    }
  }

  return getTerminologyForTenant(client, tenantId);
}
