// Minimal RFC 4180-ish CSV writer — no external dependency needed for
// something this small. Reused by exportService.js (FR-030) now, and by
// audit log export (FR-031) next — one writer, not two copies.
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function rowsToCsv(columns, rows) {
  const header = columns.map(csvEscape).join(',');
  const lines = rows.map((row) => columns.map((col) => csvEscape(row[col])).join(','));
  return [header, ...lines].join('\r\n');
}
