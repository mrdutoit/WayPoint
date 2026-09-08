const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(value) {
  if (!value) return '\u2014';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${Number(day)} ${MONTH_ABBR[Number(month) - 1]} ${year}`;
}

export function formatDateTime(value) {
  if (!value) return '\u2014';
  const d = new Date(value);
  const datePart = `${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${datePart}, ${hh}:${mm}`;
}
