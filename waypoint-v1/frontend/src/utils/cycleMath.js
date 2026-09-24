// Pure date/cadence helpers behind the Dashboard's course line and its
// "check in next" list. Kept out of the component so the arithmetic is
// unit-tested (tests/cycleMath.test.js) — this codebase has no frontend
// component harness, and date logic is exactly where a silent
// off-by-one survives `npm run build`.

const DAY_MS = 86400000;

// Cycle dates arrive as plain 'YYYY-MM-DD' (db.js registers a DATE type
// parser). Parsed as a LOCAL calendar date, never via new Date(string),
// which would read it as UTC midnight and shift a day west of Greenwich.
export function parseDay(value) {
  if (!value) return null;
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Where "today" sits in a Cycle. Days are 1-based and inclusive of both
 * ends: a 1 Jul – 30 Sep Cycle is 92 days, 1 Jul is day 1.
 */
export function cycleProgress(startDate, endDate, now = new Date()) {
  const start = parseDay(startDate);
  const end = parseDay(endDate);
  if (!start || !end || end < start) return null;
  const today = startOfDay(now);
  const totalDays = Math.round((end - start) / DAY_MS) + 1;
  const rawDay = Math.round((today - start) / DAY_MS) + 1;
  const dayNumber = Math.min(Math.max(rawDay, 1), totalDays);
  const daysLeft = Math.max(0, Math.round((end - today) / DAY_MS));
  // Fraction along the course, measured to the START of today — so day 1
  // sits exactly on the start marker and the last day just short of the end.
  const fraction = Math.min(1, Math.max(0, (today - start) / (end - start + DAY_MS)));
  return { start, end, totalDays, dayNumber, daysLeft, fraction, beforeStart: rawDay < 1, afterEnd: today > end };
}

/** Horizontal position (0..1) of any timestamp within the Cycle. */
export function positionInCycle(timestamp, startDate, endDate) {
  const start = parseDay(startDate);
  const end = parseDay(endDate);
  if (!start || !end) return null;
  const t = new Date(timestamp).getTime();
  if (Number.isNaN(t)) return null;
  return Math.min(1, Math.max(0, (t - start.getTime()) / (end.getTime() + DAY_MS - start.getTime())));
}

/** First-of-month boundaries falling inside the Cycle, for axis ticks. */
export function monthTicks(startDate, endDate) {
  const start = parseDay(startDate);
  const end = parseDay(endDate);
  if (!start || !end) return [];
  const ticks = [];
  let cursor = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  while (cursor <= end) {
    ticks.push({ date: cursor, fraction: (cursor - start) / (end - start + DAY_MS) });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return ticks;
}

export function daysSince(timestamp, now = new Date()) {
  if (!timestamp) return null;
  const then = startOfDay(new Date(timestamp));
  return Math.max(0, Math.round((startOfDay(now) - then) / DAY_MS));
}

// No per-Key-Result check-in schedule exists in the data model (see
// reportingService.getCheckinCompliance's note), so "due" is a fixed,
// honestly-labelled threshold rather than a tenant cadence.
export const STALE_AFTER_DAYS = 14;

/**
 * Orders Key Results by how much they need a Check-in: never checked in
 * first (heaviest weighting first among those), then oldest last
 * Check-in. `due` marks never-checked-in or older than STALE_AFTER_DAYS.
 * Input: [{ id, title, weighting, objectiveId, objectiveTitle, lastCheckInAt }]
 */
export function checkInQueue(keyResults, now = new Date()) {
  return keyResults
    .map((kr) => {
      const age = daysSince(kr.lastCheckInAt, now);
      return { ...kr, daysSinceCheckIn: age, due: age === null || age >= STALE_AFTER_DAYS };
    })
    .sort((a, b) => {
      if (a.daysSinceCheckIn === null && b.daysSinceCheckIn !== null) return -1;
      if (b.daysSinceCheckIn === null && a.daysSinceCheckIn !== null) return 1;
      if (a.daysSinceCheckIn === null) return Number(b.weighting ?? 0) - Number(a.weighting ?? 0);
      return b.daysSinceCheckIn - a.daysSinceCheckIn;
    });
}

export function relativeDays(days) {
  if (days === null || days === undefined) return 'Never';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  return `${weeks} weeks ago`;
}
