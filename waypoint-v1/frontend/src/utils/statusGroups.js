// Rubric labels are tenant-configurable (FR-017) — a tenant can rename
// "On Track" to whatever it wants. STATUS_META (tokens.js) only knows how
// to colour the five default labels; this canonical order is what puts
// those five in a sensible sequence when present, with anything else
// (a renamed rubric level) appended alphabetically rather than assumed
// not to exist.
const CANONICAL_ORDER = ['Not Started', 'Off Track', 'At Risk', 'On Track', 'Achieved'];

/**
 * Groups a list of items by a status field into [{ status, count }],
 * ordered by CANONICAL_ORDER first, then any other status alphabetically.
 * Used by every status chart (Dashboard, Team Progress, Scorecard) so the
 * grouping/ordering logic exists in exactly one place.
 */
export function groupByStatus(items, statusKey = 'status') {
  const counts = new Map();
  for (const item of items) {
    const status = item[statusKey] ?? 'Not Started';
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const known = CANONICAL_ORDER
    .filter((status) => counts.has(status))
    .map((status) => ({ status, count: counts.get(status) }));
  const unknown = [...counts.keys()]
    .filter((status) => !CANONICAL_ORDER.includes(status))
    .sort()
    .map((status) => ({ status, count: counts.get(status) }));
  return [...known, ...unknown];
}
