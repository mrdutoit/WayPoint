import { useState, useRef, useEffect } from 'react';
import { s, colors, radius, shadow } from '../styles/tokens.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function pad2(n) { return String(n).padStart(2, '0'); }
function toISO(year, month, day) { return `${year}-${pad2(month + 1)}-${pad2(day)}`; } // month is 0-indexed in, 1-indexed out
function parseISO(value) {
  if (!value) return null;
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m - 1, day: d };
}
function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function mondayFirstWeekday(year, month, day) { return (new Date(year, month, day).getDay() + 6) % 7; }
function todayParts() {
  const t = new Date();
  return { year: t.getFullYear(), month: t.getMonth(), day: t.getDate() };
}

/**
 * DatePicker — click-to-open calendar popover, ported from MedBroker's
 * component of the same name and same reasoning: native
 * <input type="date"> gets full accessibility and an OS-native picker
 * for free, which is the right call on a public/anonymous-facing form
 * where a one-time visitor fills it in on their own phone — but that
 * trade-off runs the other way for staff who live in an internal app
 * daily, where a consistent, unmistakably-clickable picker matters more
 * than what the browser happens to render. WayPoint has no public-facing
 * forms at all yet, so every current and near-term call site qualifies —
 * unlike MedBroker, there's no "Portal forms keep the native input"
 * carve-out needed here (yet; worth revisiting if that ever changes).
 *
 * Simplified from MedBroker's version in one deliberate way: no typed
 * free-text entry. MedBroker's supports typing DD-MM-YYYY, but that's
 * tied to an app-wide day-first date-FORMAT standard MedBroker
 * established for every displayed date — WayPoint hasn't made that
 * decision, and inventing a second date format here (typed DD-MM-YYYY
 * alongside the plain ISO YYYY-MM-DD shown everywhere else, e.g. the
 * Cycles table) would be a worse inconsistency than what this replaces.
 * The field is click-only (readOnly) — worth revisiting together if
 * WayPoint ever adopts its own display-format standard the way
 * MedBroker did.
 *
 * Value contract: 'YYYY-MM-DD' string in, 'YYYY-MM-DD' string out via
 * onChange(value) — a plain value, not a synthetic event.
 *
 * Calendar popover: month/year are two native <select> dropdowns in the
 * header, not prev/next-arrows-only — reaching a distant year by
 * clicking "previous month" repeatedly is a real, common date-picker
 * usability failure this avoids from the start. Year range is
 * currentYear-10 to currentYear+10 — WayPoint's current dates are all
 * near-term Cycle dates, not birth dates, so MedBroker's -100/+10 range
 * doesn't apply here.
 *
 * Escape and click-outside both close the popover. Every <button>
 * inside is explicitly type="button" — this sits inside a real
 * <form onSubmit> (OkrSettings.jsx's Cycles form), where an untyped
 * button defaults to type="submit" and would prematurely submit.
 *
 * @param {string} value - 'YYYY-MM-DD' or '' / null / undefined
 * @param {(value: string) => void} onChange
 * @param {boolean} [required]
 * @param {object} [style] - merged over the default formInput style
 */
export default function DatePicker({ value, onChange, required, style }) {
  const parts = parseISO(value);
  const today = todayParts();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parts?.year ?? today.year);
  const [viewMonth, setViewMonth] = useState(parts?.month ?? today.month);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (open) return;
    const p = parseISO(value);
    setViewYear(p?.year ?? today.year);
    setViewMonth(p?.month ?? today.month);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    function handleEscape(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function selectDay(day) {
    onChange(toISO(viewYear, viewMonth, day));
    setOpen(false);
  }

  const yearOptions = [];
  for (let y = today.year + 10; y >= today.year - 10; y--) yearOptions.push(y);

  const firstWeekday = mondayFirstWeekday(viewYear, viewMonth, 1);
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells = Array(firstWeekday).fill(null).concat(
    Array.from({ length: totalDays }, (_, i) => i + 1)
  );

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: style?.width ?? '100%' }}>
      <input
        type="text"
        readOnly
        required={required}
        placeholder="YYYY-MM-DD"
        style={{ ...s.formInput, ...style, paddingRight: 30, cursor: 'pointer' }}
        value={value ?? ''}
        onClick={() => setOpen((o) => !o)}
      />
      <button
        type="button"
        aria-label="Open calendar"
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 4, display: 'flex', color: colors.ink500,
        }}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="2" y="3" width="12" height="11" rx="1.5" />
          <path d="M2 6.5h12M5 1.5v3M11 1.5v3" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 1000,
          background: colors.panel, border: `1px solid ${colors.line}`,
          borderRadius: radius.md, boxShadow: shadow.lg, padding: 10, width: 260,
        }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <select
              value={viewMonth} onChange={(e) => setViewMonth(Number(e.target.value))}
              style={{ ...s.formInput, padding: '4px 6px', fontSize: 13, flex: 1.4, width: 'auto' }}
            >
              {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select
              value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))}
              style={{ ...s.formInput, padding: '4px 6px', fontSize: 13, flex: 1, width: 'auto' }}
            >
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} style={{ textAlign: 'center', fontSize: 11, color: colors.ink400, fontWeight: 600 }}>{w}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((day, i) => {
              if (day === null) return <div key={`blank-${i}`} />;
              const isSelected = parts && parts.year === viewYear && parts.month === viewMonth && parts.day === day;
              const isToday = today.year === viewYear && today.month === viewMonth && today.day === day;
              return (
                <button
                  key={day} type="button" onClick={() => selectDay(day)}
                  style={{
                    padding: '6px 0', borderRadius: radius.sm, fontFamily: 'inherit', fontSize: 13,
                    border: isToday && !isSelected ? `1px solid ${colors.brand500}` : '1px solid transparent',
                    background: isSelected ? colors.brand600 : 'transparent',
                    color: isSelected ? '#fff' : colors.ink900,
                    cursor: 'pointer',
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
