import { STATUS_META, colors } from '../../styles/tokens.js';
import './viz.css';

export function statusColor(status) {
  return STATUS_META[status]?.color ?? colors.ink400;
}

export function StatusText({ status }) {
  return (
    <span className="vz-status" style={{ color: statusColor(status) }}>
      <span className="vz-dot" style={{ background: statusColor(status) }} />
      {status}
    </span>
  );
}

export function ConfidencePips({ value }) {
  const n = Math.round(Number(value) || 0);
  return (
    <span className="vz-pips" aria-label={`Confidence ${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= n ? 'on' : ''} />)}
    </span>
  );
}

/**
 * One tooltip card for every chart. Positioned in px inside its (relative)
 * container; flips to the left/right edge near the container's sides so
 * it never clips, and drops below when there's no room above.
 */
export function Tooltip({ x, y, containerWidth, below = false, children }) {
  let cls = 'vz-tip';
  if (below) cls += ' vz-tip-below';
  else if (containerWidth && x > containerWidth - 150) cls += ' vz-tip-left';
  else if (containerWidth && x < 150) cls += ' vz-tip-right';
  return (
    <div className={cls} style={{ left: x, top: y }} role="tooltip">
      {children}
    </div>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatStamp(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}
export function formatDay(d) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** The detail card for one Check-in — shared by the course line and the confidence trail. */
export function CheckInDetail({ checkIn, keyResultTitle, objectiveTitle }) {
  const comment = checkIn.comment ? String(checkIn.comment) : '';
  return (
    <>
      {keyResultTitle && <div className="vz-tip-title">{keyResultTitle}</div>}
      {objectiveTitle && <div className="vz-tip-sub">{objectiveTitle}</div>}
      <div className="vz-tip-row"><span className="vz-tip-label">When</span><span>{formatStamp(checkIn.submittedAt)}</span></div>
      <div className="vz-tip-row"><span className="vz-tip-label">Score</span><StatusText status={checkIn.scoreLabel} /></div>
      <div className="vz-tip-row"><span className="vz-tip-label">Confidence</span><ConfidencePips value={checkIn.confidence} /></div>
      {checkIn.submittedByName && (
        <div className="vz-tip-row"><span className="vz-tip-label">By</span><span>{checkIn.submittedByName}</span></div>
      )}
      {comment && <div className="vz-tip-quote">&ldquo;{comment.length > 160 ? `${comment.slice(0, 157)}…` : comment}&rdquo;</div>}
    </>
  );
}
