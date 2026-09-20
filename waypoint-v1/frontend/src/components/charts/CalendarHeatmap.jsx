import { colors } from '../../styles/tokens.js';

function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function levelColor(count) {
  if (count === 0) return colors.ink100;
  if (count === 1) return `color-mix(in srgb, ${colors.success} 40%, ${colors.ink100})`;
  if (count === 2) return `color-mix(in srgb, ${colors.success} 70%, ${colors.ink100})`;
  return colors.success;
}

/**
 * One person's Check-in cadence across the Cycle, GitHub-contributions
 * style: weeks as columns, days-of-week as rows, so it reads as a
 * compact block rather than a single long strip — several of these can
 * stack, one per person, without needing much vertical space each.
 *
 * checkInsByDate: [{date, count}] — from getCheckinCompliance
 * (reportingService.js). Future days (the Cycle hasn't reached them
 * yet) render as a dashed empty outline, not the same "0" colour as a
 * past day with no Check-in — those mean different things and
 * shouldn't look identical.
 */
export default function CalendarHeatmap({ startDate, endDate, checkInsByDate, cellSize = 11, gap = 3 }) {
  const countByDay = new Map((checkInsByDate ?? []).map((c) => [dayKey(c.date), c.count]));

  const start = new Date(startDate);
  const end = new Date(endDate);
  const today = new Date();

  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  // Pad the front so the first real day lands in its correct weekday
  // row (0 = Sunday) — otherwise every person's grid would start at
  // row 1 regardless of what day their Cycle actually began on.
  const padded = [...Array(start.getDay()).fill(null), ...days];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: `repeat(7, ${cellSize}px)`,
        gridAutoFlow: 'column',
        gap,
      }}
    >
      {padded.map((d, i) => {
        if (!d) return <div key={`pad-${i}`} style={{ width: cellSize, height: cellSize }} />;
        const key = dayKey(d);
        const count = countByDay.get(key) ?? 0;
        const isFuture = d > today;
        return (
          <div
            key={key}
            title={`${d.toLocaleDateString()}: ${isFuture ? "hasn't happened yet" : `${count} check-in${count === 1 ? '' : 's'}`}`}
            style={{
              width: cellSize, height: cellSize, borderRadius: 2,
              background: isFuture ? 'transparent' : levelColor(count),
              border: isFuture ? `1px dashed ${colors.line}` : 'none',
              boxSizing: 'border-box',
            }}
          />
        );
      })}
    </div>
  );
}
