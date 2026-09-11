/**
 * Pure date-math for Cycle end-date computation — no DB, no I/O, so it's
 * cheap to test exhaustively, which matters here: "add N months" has a
 * real edge case (a start date near month-end) that's easy to get wrong
 * silently. All functions take/return 'YYYY-MM-DD' strings and work in
 * UTC throughout to avoid local-timezone drift changing which calendar
 * day a date string represents.
 */

/**
 * Adds `months` calendar months to `dateStr`, clamping to the last valid
 * day of the target month rather than overflowing into the next one —
 * e.g. 2026-01-31 + 1 month -> 2026-02-28, not 2026-03-03. This is the
 * usual "add months" convention (matches date-fns/dayjs) and the more
 * useful one for cycle boundaries, where rolling into a third month on
 * a two-month step would be a silent correctness bug, not a rounding
 * nicety.
 */
export function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetIndex = (m - 1) + months; // 0-based month count from year 0
  const targetYear = y + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12; // 0-based, normalised positive
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(d, lastDayOfTargetMonth);
  return new Date(Date.UTC(targetYear, targetMonth, clampedDay)).toISOString().slice(0, 10);
}

/**
 * A Cycle's end date is the last day of its `months`-th month — e.g. a
 * Quarterly Cycle starting 2026-07-01 ends 2026-09-30 (start + 3 months,
 * minus a day), not 2026-10-01. Matches the existing "Q3 2026" sample
 * data (2026-07-01 to 2026-09-30) created before this rework, so the
 * backfill migration's semantics line up with what was already there.
 */
export function computeCycleEndDate(startDate, months) {
  const dayAfter = addMonths(startDate, months);
  const d = new Date(`${dayAfter}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
