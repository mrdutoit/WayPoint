import { describe, it, expect } from 'vitest';
import {
  parseDay, cycleProgress, positionInCycle, monthTicks, daysSince, checkInQueue, relativeDays,
} from '../frontend/src/utils/cycleMath.js';

describe('cycleMath', () => {
  it('parses a plain date as a local calendar day', () => {
    const d = parseDay('2026-07-01');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 6, 1]);
    expect(parseDay('2026-09-30T00:00:00.000Z').getDate()).toBe(30);
    expect(parseDay(null)).toBeNull();
  });

  it('counts days inclusively — a Q3 Cycle is 92 days, 1 Jul is day 1', () => {
    const p = cycleProgress('2026-07-01', '2026-09-30', new Date(2026, 6, 1, 15));
    expect(p.totalDays).toBe(92);
    expect(p.dayNumber).toBe(1);
    expect(p.fraction).toBe(0);
    expect(p.daysLeft).toBe(91);
  });

  it('places 24 September as day 86 with 6 days left', () => {
    const p = cycleProgress('2026-07-01', '2026-09-30', new Date(2026, 8, 24, 9));
    expect(p.dayNumber).toBe(86);
    expect(p.daysLeft).toBe(6);
    expect(p.fraction).toBeCloseTo(85 / 92, 5);
  });

  it('clamps before the start and after the end', () => {
    expect(cycleProgress('2026-07-01', '2026-09-30', new Date(2026, 5, 20)).dayNumber).toBe(1);
    const after = cycleProgress('2026-07-01', '2026-09-30', new Date(2026, 9, 5));
    expect(after.dayNumber).toBe(92);
    expect(after.afterEnd).toBe(true);
    expect(after.fraction).toBe(1);
  });

  it('returns null for a malformed or inverted range', () => {
    expect(cycleProgress('2026-09-30', '2026-07-01')).toBeNull();
    expect(cycleProgress(null, '2026-07-01')).toBeNull();
  });

  it('positions a timestamp along the Cycle', () => {
    expect(positionInCycle(new Date(2026, 6, 1).toISOString(), '2026-07-01', '2026-09-30')).toBe(0);
    expect(positionInCycle('not a date', '2026-07-01', '2026-09-30')).toBeNull();
  });

  it('produces a tick for each month boundary inside the Cycle', () => {
    const ticks = monthTicks('2026-07-01', '2026-09-30');
    expect(ticks.map((t) => t.date.getMonth())).toEqual([7, 8]); // 1 Aug, 1 Sep
    expect(ticks[0].fraction).toBeCloseTo(31 / 92, 5);
  });

  it('measures days since a check-in by calendar day', () => {
    expect(daysSince(new Date(2026, 8, 23, 23, 50), new Date(2026, 8, 24, 0, 10))).toBe(1);
    expect(daysSince(null)).toBeNull();
  });

  it('orders the check-in queue: never first (heaviest first), then oldest', () => {
    const now = new Date(2026, 8, 24);
    const q = checkInQueue([
      { id: 'recent', weighting: 5, lastCheckInAt: new Date(2026, 8, 22) },
      { id: 'never-light', weighting: 1, lastCheckInAt: null },
      { id: 'old', weighting: 1, lastCheckInAt: new Date(2026, 7, 20) },
      { id: 'never-heavy', weighting: 3, lastCheckInAt: null },
    ], now);
    expect(q.map((k) => k.id)).toEqual(['never-heavy', 'never-light', 'old', 'recent']);
    expect(q.map((k) => k.due)).toEqual([true, true, true, false]);
  });

  it('describes elapsed days in plain language', () => {
    expect(relativeDays(null)).toBe('Never');
    expect(relativeDays(0)).toBe('Today');
    expect(relativeDays(1)).toBe('Yesterday');
    expect(relativeDays(5)).toBe('5 days ago');
    expect(relativeDays(21)).toBe('3 weeks ago');
  });
});
