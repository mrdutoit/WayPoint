import { describe, it, expect } from 'vitest';
import { addMonths, computeCycleEndDate } from '../frontend/api-lib/services/dateMath.js';

describe('addMonths', () => {
  it('adds a simple whole number of months within the same year', () => {
    expect(addMonths('2026-01-15', 3)).toBe('2026-04-15');
  });

  it('rolls over into the next year', () => {
    expect(addMonths('2026-11-01', 3)).toBe('2027-02-01');
  });

  it('clamps to the last day of the target month instead of overflowing (Jan 31 + 1 month)', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28'); // 2026 is not a leap year
  });

  it('clamps correctly into a leap-year February', () => {
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29'); // 2028 is a leap year
  });

  it('handles a full 12-month step (Annually)', () => {
    expect(addMonths('2026-03-10', 12)).toBe('2027-03-10');
  });
});

describe('computeCycleEndDate', () => {
  it('matches the existing Q3 2026 sample data: 2026-07-01 Quarterly -> 2026-09-30', () => {
    expect(computeCycleEndDate('2026-07-01', 3)).toBe('2026-09-30');
  });

  it('computes a Monthly cycle end date', () => {
    expect(computeCycleEndDate('2026-01-01', 1)).toBe('2026-01-31');
  });

  it('computes a Bi-Annually cycle end date', () => {
    expect(computeCycleEndDate('2026-01-01', 6)).toBe('2026-06-30');
  });

  it('computes an Annually cycle end date', () => {
    expect(computeCycleEndDate('2026-01-01', 12)).toBe('2026-12-31');
  });

  it('handles a start date near month-end without silently drifting a day', () => {
    // 2026-01-30 + 1 month clamps to 2026-02-28, then -1 day -> 2026-02-27.
    // Worth asserting explicitly: this is the one shape where "add then
    // subtract a day" could plausibly drift if the clamp were applied
    // inconsistently between the two steps.
    expect(computeCycleEndDate('2026-01-30', 1)).toBe('2026-02-27');
  });
});
