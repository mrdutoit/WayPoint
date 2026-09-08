const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * For DATE-only values (Cycle startDate/endDate, Initiative dueDate) —
 * reads the calendar date straight out of the string, never constructs a
 * Date object, so it can never be shifted by the viewer's local timezone.
 */
export function formatDate(value) {
  if (!value) return '\u2014';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${Number(day)} ${MONTH_ABBR[Number(month) - 1]} ${year}`;
}

/**
 * For genuine timestamps (createdAt, submittedAt, timestamp on AuditLog) —
 * a moment in time that legitimately renders differently depending on the
 * viewer's timezone.
 */
export function formatDateTime(value) {
  if (!value) return '\u2014';
  const d = new Date(value);
  const datePart = `${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${datePart}, ${hh}:${mm}`;
}
