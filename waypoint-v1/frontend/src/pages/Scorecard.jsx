import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import { useTerms } from '../context/TerminologyContext.jsx';
import { reportsApi } from '../services/api.js';
import { Avatar } from '../components/Avatar.jsx';
import { formatDate } from '../utils/dateFormat.js';
import { cycleProgress, daysSince, relativeDays } from '../utils/cycleMath.js';
import CourseLine from '../components/viz/CourseLine.jsx';
import StatusRing from '../components/viz/StatusRing.jsx';
import StatusBars from '../components/viz/StatusBars.jsx';
import WeightMap from '../components/viz/WeightMap.jsx';
import ConfidenceTrail from '../components/viz/ConfidenceTrail.jsx';
import { StatusText, ConfidencePips, statusColor, formatStamp } from '../components/viz/Tooltip.jsx';
import './dashboard.css';
import './scorecard.css';

/*
 * Scorecard — 2026-09-24 redesign, in the Dashboard's language.
 *
 * Previously: a generic "Scorecard" heading with nothing saying whose it
 * was, one treemap pooling Key Results across Objectives (misleading —
 * see WeightMap.jsx), bare two-point sparklines, and check-in history as
 * a run of plain text lines.
 *
 * Now: the same course-line hero as the Dashboard, for the person whose
 * scorecard this is (reportingService.getScorecard now returns them);
 * an at-a-glance row; then one section per Objective with its own
 * weighting map and a row per Key Result carrying a confidence trail,
 * its latest word, and an expandable Check-in timeline. Every chart is
 * interactive — hover or focus for the detail behind a mark.
 */

const ON_COURSE = ['On Track', 'Achieved'];

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function CheckInTimeline({ checkIns }) {
  return (
    <ol className="sc-timeline">
      {checkIns.slice().reverse().map((ci, i) => (
        <li key={i}>
          <span className="sc-timeline-dot" style={{ background: statusColor(ci.scoreLabel) }} />
          <div className="sc-timeline-head">
            <StatusText status={ci.scoreLabel} />
            <ConfidencePips value={ci.confidence} />
            <span className="sc-timeline-when">{formatStamp(ci.submittedAt)}</span>
          </div>
          {ci.comment && <p className="sc-timeline-comment">{ci.comment}</p>}
        </li>
      ))}
    </ol>
  );
}

function KeyResultRow({ kr, share, terms }) {
  const { t, tPlural } = terms;
  const history = kr.checkInHistory;
  const last = history.at(-1);
  return (
    <div className="sc-kr">
      <div className="sc-kr-main">
        <div className="sc-kr-title">{kr.title}</div>
        <div className="sc-kr-meta">
          <span>{share}% of the score</span>
          <span>{last ? `Last ${t('CheckIn').toLowerCase()} ${relativeDays(daysSince(last.submittedAt)).toLowerCase()}` : `No ${tPlural('CheckIn').toLowerCase()} yet`}</span>
        </div>
        {last?.comment && <p className="sc-kr-quote">&ldquo;{last.comment}&rdquo;</p>}
      </div>
      <div className="sc-kr-trail">
        {history.length > 0 ? <ConfidenceTrail checkIns={history} /> : <span className="sc-kr-none">Awaiting first {t('CheckIn').toLowerCase()}</span>}
      </div>
      <div className="sc-kr-status"><StatusText status={kr.status} /></div>
      {history.length > 0 && (
        <details className="sc-kr-history">
          <summary>{plural(history.length, t('CheckIn').toLowerCase(), tPlural('CheckIn').toLowerCase())}</summary>
          <CheckInTimeline checkIns={history} />
        </details>
      )}
    </div>
  );
}

function ObjectiveSection({ objective, terms }) {
  const { t, tPlural } = terms;
  const total = objective.keyResults.reduce((sum, kr) => sum + Math.max(Number(kr.weighting) || 0, 0), 0);
  return (
    <section className="sc-objective">
      <div className="sc-objective-head">
        <div>
          <h2 className="sc-objective-title db-display">{objective.title}</h2>
          <div className="sc-objective-meta">
            {plural(objective.keyResults.length, t('KeyResult').toLowerCase(), tPlural('KeyResult').toLowerCase())}
          </div>
        </div>
        <div className="sc-objective-right">
          <StatusText status={objective.status} />
          <Link className="db-link" to={`/objectives/${objective.id}`}>Open</Link>
        </div>
      </div>

      {objective.keyResults.length === 0 ? (
        <div className="db-empty">No {tPlural('KeyResult').toLowerCase()} on this {t('Objective').toLowerCase()} yet.</div>
      ) : (
        <>
          <div className="sc-map-caption">What each {t('KeyResult').toLowerCase()} contributes to this {t('Objective').toLowerCase()}&apos;s score</div>
          <WeightMap keyResults={objective.keyResults} />
          <div className="sc-krs">
            {objective.keyResults.map((kr) => (
              <KeyResultRow
                key={kr.id} kr={kr} terms={terms}
                share={total > 0 ? Math.round((Math.max(Number(kr.weighting) || 0, 0) / total) * 100) : 0}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default function Scorecard() {
  const { userId } = useParams();
  const { user } = useRole();
  const terms = useTerms();
  const { t, tPlural } = terms;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    setData(null);
    reportsApi.scorecard(userId)
      .then(setData)
      .catch((err) => {
        if (err.status === 403) setForbidden(true);
        else setError(err.message ?? 'Failed to load scorecard');
      });
  }, [userId]);

  if (forbidden) return <div className="db"><div className="db-empty">You don&apos;t have access to this scorecard. You can view your own, or a direct report&apos;s.</div></div>;
  if (error) return <div className="db"><div className="db-empty">This scorecard couldn&apos;t load ({error}).</div></div>;
  if (!data) return <div className="db"><div className="db-skeleton" aria-label="Loading" /></div>;

  const person = data.person ?? {};
  const isSelf = user?.id === person.id || user?.id === userId;
  const name = [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Scorecard';
  const whose = isSelf ? 'your' : `${person.firstName ?? 'their'}\u2019s`;
  const cycle = data.cycle;
  const progress = cycle ? cycleProgress(cycle.startDate, cycle.endDate) : null;

  const objectives = data.objectives;
  const keyResults = objectives.flatMap((o) => o.keyResults);
  const checkIns = objectives.flatMap((o) => o.keyResults.flatMap((kr) => kr.checkInHistory.map((ci) => ({
    ...ci, keyResultTitle: kr.title, objectiveId: o.id, objectiveTitle: o.title,
  }))));
  const onCourse = objectives.filter((o) => ON_COURSE.includes(o.status)).length;
  const pct = objectives.length ? Math.round((onCourse / objectives.length) * 100) : 0;
  const lastCheckIn = checkIns.map((c) => c.submittedAt).sort().at(-1);
  const latestConfidences = keyResults.map((kr) => kr.checkInHistory.at(-1)?.confidence).filter((c) => c !== undefined && c !== null);
  const avgConfidence = latestConfidences.length ? latestConfidences.reduce((a, b) => a + Number(b), 0) / latestConfidences.length : null;
  const unscored = keyResults.filter((kr) => kr.checkInHistory.length === 0).length;

  return (
    <div className="db">
      <Link to="/reports" className="db-link sc-back">&larr; Reports</Link>

      <section className="db-hero" data-theme="dark">
        <div className="db-hero-top">
          <div className="sc-who">
            <Avatar firstName={person.firstName} lastName={person.lastName} avatarOption={person.avatarOption} size={52} />
            <div>
              <p className="db-greeting" style={{ margin: 0 }}>{isSelf ? 'Your scorecard' : 'Scorecard'}</p>
              <h1 className="db-day db-display sc-name">{name}</h1>
            </div>
          </div>
          {cycle && (
            <div className="db-cycle-meta">
              <span className="db-cycle-name">{cycle.name}</span>
              {progress && `Day ${progress.dayNumber} of ${progress.totalDays}, closes ${formatDate(cycle.endDate)}`}
            </div>
          )}
        </div>

        {!cycle ? (
          <p className="db-summary">No active {t('Cycle').toLowerCase()} right now, so there&apos;s nothing to score.</p>
        ) : (
          <>
            <p className="db-summary">
              {objectives.length === 0
                ? <>No {tPlural('Objective').toLowerCase()} owned this {t('Cycle').toLowerCase()}.</>
                : <>
                    <strong>{onCourse} of {objectives.length}</strong> {(objectives.length === 1 ? t('Objective') : tPlural('Objective')).toLowerCase()} on track or achieved,
                    {' '}<strong>{checkIns.length}</strong> {(checkIns.length === 1 ? t('CheckIn') : tPlural('CheckIn')).toLowerCase()} so far
                    {unscored > 0 && <>, <strong>{unscored}</strong> {(unscored === 1 ? t('KeyResult') : tPlural('KeyResult')).toLowerCase()} still waiting for a first one</>}.
                  </>}
            </p>
            {progress && <CourseLine cycle={cycle} progress={progress} checkIns={checkIns} whose={whose} />}
          </>
        )}
      </section>

      {cycle && objectives.length > 0 && (
        <>
          <div className="db-glance">
            <section className="vz-panel">
              <h2 className="vz-panel-title">{tPlural('Objective')}</h2>
              <p className="vz-panel-note">Share on track or achieved</p>
              <StatusRing items={objectives} noun={tPlural('Objective').toLowerCase()} headline={{ figure: `${pct}%`, caption: 'on track or achieved' }} />
            </section>
            <section className="vz-panel">
              <h2 className="vz-panel-title">{tPlural('KeyResult')}</h2>
              <p className="vz-panel-note">Latest score for each</p>
              <StatusBars items={keyResults} />
            </section>
            <section className="vz-panel">
              <h2 className="vz-panel-title">Rhythm</h2>
              <p className="vz-panel-note">How recently and how confidently</p>
              <dl className="sc-stats">
                <div><dt>{tPlural('CheckIn')} this {t('Cycle').toLowerCase()}</dt><dd className="db-display">{checkIns.length}</dd></div>
                <div><dt>Last {t('CheckIn').toLowerCase()}</dt><dd className="db-display sc-stat-text">{lastCheckIn ? relativeDays(daysSince(lastCheckIn)) : 'Never'}</dd></div>
                <div>
                  <dt>Average current confidence</dt>
                  <dd>{avgConfidence === null ? <span className="db-display sc-stat-text">None yet</span> : (
                    <span className="sc-conf"><span className="db-display">{avgConfidence.toFixed(1)}</span><small>/5</small><ConfidencePips value={avgConfidence} /></span>
                  )}</dd>
                </div>
              </dl>
            </section>
          </div>

          {objectives.map((obj) => <ObjectiveSection key={obj.id} objective={obj} terms={terms} />)}
        </>
      )}
    </div>
  );
}
