import './viz.css';

/*
 * Roll-up coverage (2026-09-25): "2 of 3 reporting" beside a status. An
 * Objective's status is a health reading of what has been reported so
 * far, not a completion measure — this makes the "so far" visible. The
 * counts are written by scoringService.recomputeObjectiveStatus: each own
 * Key Result with a Check-in, and each linked child Objective that isn't
 * "Not Started", out of all of them.
 *
 * variant: 'full' ("2 of 3 reporting" + pips) | 'compact' ("2/3")
 */
export default function Coverage({ reporting, total, variant = 'full', onDark = false }) {
  if (!total) return null;
  const complete = reporting >= total;
  const title = `${reporting} of the ${total} Key Results and linked objectives beneath this have reported. The status reflects ${complete ? 'all of them' : 'those only'}.`;
  if (variant === 'compact') {
    return (
      <span className={`vz-cov compact${complete ? ' complete' : ''}${onDark ? ' on-dark' : ''}`} title={title} aria-label={title}>
        {reporting}/{total}
      </span>
    );
  }
  return (
    <span className={`vz-cov${complete ? ' complete' : ''}${onDark ? ' on-dark' : ''}`} title={title} aria-label={title}>
      <span className="vz-cov-pips" aria-hidden="true">
        {Array.from({ length: Math.min(total, 12) }).map((_, i) => (
          <span key={i} className={i < Math.round((reporting / total) * Math.min(total, 12)) ? 'on' : ''} />
        ))}
      </span>
      {reporting} of {total} reporting
    </span>
  );
}
