import { describe, it, expect } from 'vitest';
import { rowsToCsv } from '../frontend/api-lib/csv.js';

describe('rowsToCsv', () => {
  it('writes a header row followed by one line per row, comma-joined', () => {
    const csv = rowsToCsv(['id', 'title'], [{ id: '1', title: 'Grow revenue' }, { id: '2', title: 'Ship v2' }]);
    expect(csv).toBe('id,title\r\n1,Grow revenue\r\n2,Ship v2');
  });

  it('quotes and escapes a value containing a comma', () => {
    const csv = rowsToCsv(['title'], [{ title: 'Ship, then measure' }]);
    expect(csv).toBe('title\r\n"Ship, then measure"');
  });

  it('quotes and doubles internal quotes', () => {
    const csv = rowsToCsv(['comment'], [{ comment: 'She said "great work"' }]);
    expect(csv).toBe('comment\r\n"She said ""great work"""');
  });

  it('quotes a value containing a newline', () => {
    const csv = rowsToCsv(['comment'], [{ comment: 'Line one\nLine two' }]);
    expect(csv).toBe('comment\r\n"Line one\nLine two"');
  });

  it('renders null and undefined as empty, not the literal word', () => {
    const csv = rowsToCsv(['a', 'b'], [{ a: null, b: undefined }]);
    expect(csv).toBe('a,b\r\n,');
  });

  it('produces just the header row for an empty row set (so a zero-row tenant still gets valid column headers)', () => {
    const csv = rowsToCsv(['id', 'title', 'status'], []);
    expect(csv).toBe('id,title,status');
  });

  it('formats a Date value as ISO 8601', () => {
    const csv = rowsToCsv(['submitted_at'], [{ submitted_at: new Date('2026-09-17T12:00:00.000Z') }]);
    expect(csv).toBe('submitted_at\r\n2026-09-17T12:00:00.000Z');
  });
});
