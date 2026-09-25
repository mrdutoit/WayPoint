import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import { useTerms } from '../context/TerminologyContext.jsx';
import { reportsApi } from '../services/api.js';
import { STATUS_META, colors } from '../styles/tokens.js';
import { Avatar } from '../components/Avatar.jsx';
import { formatDate } from '../utils/dateFormat.js';
import CourseLine from '../components/viz/CourseLine.jsx';
import StatusRing from '../components/viz/StatusRing.jsx';
import StatusBars from '../components/viz/StatusBars.jsx';
import {
  cycleProgress, daysSince, checkInQueue, relativeDays, STALE_AFTER_DAYS,
} from '../utils/cycleMath.js';
import './dashboard.css';
import Coverage from '../components/viz/Coverage.jsx';

/*
 * Dashboard — 2026-09-24 redesign, replacing the card-and-donut layout
 * entirely (see dashboard.css for the design concept).
 *
 * Data: no new endpoints. Everything comes from reports the caller can
 * already read —
 *   scorecard(self)   the caller's own Objectives, Key Results and
 *                     Check-in history for the active Cycle (hero,
 *                     objective rows, check-in queue)
 *   teamProgress      Managers only — their direct reports
 *   alignmentMap      any tenant member — the organisation strip
 *   checkinCompliance TenantAdmin only — one figure in the org strip
 *
 * This also fixes a correctness problem in the previous version: it
 * built its headline from objectivesApi.list(), which returns every
 * Objective in the tenant across every Cycle, while labelling the
 * result "this Cycle" and presenting it as the caller's own.
 */

const ATTENTION = ['Off Track', 'At Risk'];
const ON_COURSE = ['On Track', 'Achieved'];

function statusColor(status) {
  return STATUS_META[status]?.color ?? colors.ink400;
}

function greetingFor(date) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function StatusLabel({ status }) {
  return (
    <span className="db-status" style={{ color: statusColor(status) }}>
      <span className="db-dot" style={{ background: statusColor(status) }} />
      {status}
    </span>
  );
}

function Hero({ user, scorecard, queue, isTenantAdmin, terms }) {
  const { t, tPlural } = terms;
  const now = new Date();
  const firstName = user?.firstName ?? '';
  const greeting = `${greetingFor(now)}${firstName ? `, ${firstName}` : ''}`;
  const cycle = scorecard?.cycle;
  const progress = cycle ? cycleProgress(cycle.startDate, cycle.endDate, now) : null;

  if (!cycle || !progress) {
    return (
      <section className="db-hero" data-theme="dark">
        <p className="db-greeting">{greeting}</p>
        <h1 className="db-day db-display" style={{ fontSize: 'clamp(32px, 4.5vw, 48px)' }}>No active {t('Cycle').toLowerCase()}</h1>
        <p className="db-summary">
          {isTenantAdmin
            ? <>Nothing is being tracked right now. Create a {t('Cycle').toLowerCase()} in OKR settings and it will appear here as a course from its first day to its last.</>
            : <>Nothing is being tracked right now. Your administrator opens each {t('Cycle').toLowerCase()}; it will appear here as soon as one starts.</>}
        </p>
        {isTenantAdmin && <Link className="db-link" style={{ color: 'var(--brand700)', display: 'inline-block', marginTop: 16 }} to="/okr-settings">Open OKR settings</Link>}
      </section>
    );
  }

  const objectives = scorecard.objectives;
  const keyResults = objectives.flatMap((o) => o.keyResults);
  const checkIns = objectives.flatMap((o) => o.keyResults.flatMap((kr) => kr.checkInHistory.map((ci) => ({
    ...ci, keyResultTitle: kr.title, objectiveId: o.id, objectiveTitle: o.title,
  }))));
  const onCourse = objectives.filter((o) => ON_COURSE.includes(o.status)).length;
  const attention = objectives.filter((o) => ATTENTION.includes(o.status)).length;
  const neverCheckedIn = queue.filter((k) => k.daysSinceCheckIn === null).length;
  const stale = queue.filter((k) => k.due && k.daysSinceCheckIn !== null).length;
  const objWord = (n) => (n === 1 ? t('Objective') : tPlural('Objective')).toLowerCase();
  const krWord = (n) => (n === 1 ? t('KeyResult') : tPlural('KeyResult')).toLowerCase();

  let summary;
  if (objectives.length === 0) {
    summary = <>You don&apos;t own any {tPlural('Objective').toLowerCase()} this {t('Cycle').toLowerCase()}.</>;
  } else {
    summary = (
      <>
        <strong>{onCourse} of {objectives.length}</strong> {objWord(objectives.length)} on track or achieved
        {attention > 0 && <>, <strong>{attention}</strong> off track or at risk</>}.{' '}
        {keyResults.length === 0
          ? <>None of them has a {t('KeyResult').toLowerCase()} yet.</>
          : neverCheckedIn + stale === 0
            ? <>Every {t('KeyResult').toLowerCase()} has a {t('CheckIn').toLowerCase()} from the last two weeks.</>
            : <>
                {neverCheckedIn > 0 && <><strong>{neverCheckedIn}</strong> {krWord(neverCheckedIn)} {neverCheckedIn === 1 ? 'has' : 'have'} never been checked in</>}
                {neverCheckedIn > 0 && stale > 0 && ' and '}
                {stale > 0 && <><strong>{stale}</strong> {stale === 1 ? 'hasn\u2019t' : 'haven\u2019t'} been updated in {STALE_AFTER_DAYS}+ days</>}.
              </>}
      </>
    );
  }

  const closing = progress.afterEnd
    ? `Closed ${formatDate(cycle.endDate)}`
    : progress.beforeStart
      ? `Opens ${formatDate(cycle.startDate)}`
      : `Closes ${formatDate(cycle.endDate)}, ${plural(progress.daysLeft, 'day', 'days')} left`;

  return (
    <section className="db-hero" data-theme="dark">
      <div className="db-hero-top">
        <div>
          <p className="db-greeting">{greeting}</p>
          <h1 className="db-day db-display">
            Day {progress.dayNumber} <span className="db-day-of">of {progress.totalDays}</span>
          </h1>
        </div>
        <div className="db-cycle-meta">
          <span className="db-cycle-name">{cycle.name}</span>
          {closing}
        </div>
      </div>
      <p className="db-summary">{summary}</p>

      <CourseLine cycle={cycle} progress={progress} checkIns={checkIns} />

    </section>
  );
}

// ---------------------------------------------------------------------
// At a glance — the charts the previous Dashboard had (completion ring,
// status donut + stat row, team key result status bars), kept rather
// than dropped, rebuilt in the new chart language and re-scoped to
// data that is actually the caller's (the old ones were tenant-wide).
// ---------------------------------------------------------------------

function Glance({ scorecard, teamProgress, alignment, isManager, terms }) {
  const { t, tPlural } = terms;
  const objectives = scorecard.objectives;
  const keyResults = objectives.flatMap((o) => o.keyResults);
  const onCourse = objectives.filter((o) => ON_COURSE.includes(o.status)).length;
  const pct = objectives.length ? Math.round((onCourse / objectives.length) * 100) : 0;
  const orgObjectives = alignment?.objectives ?? [];
  const orgOnCourse = orgObjectives.filter((o) => ON_COURSE.includes(o.status)).length;

  return (
    <div className="db-glance">
      <section className="vz-panel">
        <h2 className="vz-panel-title">Your {tPlural('Objective').toLowerCase()}</h2>
        <p className="vz-panel-note">Share on track or achieved this {t('Cycle').toLowerCase()}</p>
        <StatusRing items={objectives} noun={tPlural('Objective').toLowerCase()} headline={{ figure: `${pct}%`, caption: 'on track or achieved' }} />
      </section>
      <section className="vz-panel">
        <h2 className="vz-panel-title">Your {tPlural('KeyResult').toLowerCase()}</h2>
        <p className="vz-panel-note">Latest {t('CheckIn').toLowerCase()} score for each</p>
        <StatusBars items={keyResults} />
      </section>
      {isManager ? (
        <section className="vz-panel">
          <h2 className="vz-panel-title">Team {tPlural('KeyResult').toLowerCase()}</h2>
          <p className="vz-panel-note">Across your direct reports</p>
          {teamProgress ? <StatusBars items={teamProgress.rows} /> : <div className="vz-empty">Loading…</div>}
        </section>
      ) : (
        <section className="vz-panel">
          <h2 className="vz-panel-title">Organisation</h2>
          <p className="vz-panel-note">Every {t('Objective').toLowerCase()} this {t('Cycle').toLowerCase()}</p>
          <StatusRing items={orgObjectives} noun={tPlural('Objective').toLowerCase()} headline={{ figure: `${orgOnCourse}/${orgObjectives.length}`, caption: 'on track or achieved' }} />
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Body sections
// ---------------------------------------------------------------------

function ObjectiveRows({ objectives, terms }) {
  const { t, tPlural } = terms;
  if (objectives.length === 0) {
    return (
      <div className="db-empty">
        Nothing is assigned to you this {t('Cycle').toLowerCase()}. Create an {t('Objective').toLowerCase()} of your own, or see what the rest of the organisation is working towards.
        <br />
        <Link className="db-link" to="/objectives">Go to {tPlural('Objective').toLowerCase()}</Link>
      </div>
    );
  }

  return (
    <div className="db-objectives">
      {objectives.map((obj) => {
        const totalWeight = obj.keyResults.reduce((sum, kr) => sum + (Number(kr.weighting) || 0), 0);
        const lastCheckIn = obj.keyResults
          .flatMap((kr) => kr.checkInHistory.map((ci) => ci.submittedAt))
          .sort()
          .at(-1);
        const needAttention = obj.keyResults.filter((kr) => ATTENTION.includes(kr.status)).length;
        return (
          <Link key={obj.id} to={`/objectives/${obj.id}`} className="db-objective">
            <div className="db-objective-head">
              <span className="db-objective-title">{obj.title}</span>
              <StatusLabel status={obj.status} />
            </div>
            {obj.keyResults.length === 0 ? (
              <div className="db-strip-empty" aria-hidden="true" />
            ) : (
              <div className="db-strip" role="img" aria-label={obj.keyResults.map((kr) => `${kr.title}: ${kr.status}`).join('; ')}>
                {obj.keyResults.map((kr) => (
                  <span
                    key={kr.id} title={`${kr.title}: ${kr.status} (weighting ${kr.weighting})`}
                    style={{ flexGrow: totalWeight > 0 ? Number(kr.weighting) || 0.01 : 1, flexBasis: 0, background: statusColor(kr.status) }}
                  />
                ))}
              </div>
            )}
            <div className="db-objective-meta">
              <Coverage reporting={obj.inputsReporting} total={obj.inputsTotal} />
              {needAttention > 0 && <span style={{ color: 'var(--warn)' }}>{needAttention} need{needAttention === 1 ? 's' : ''} attention</span>}
              <span>Last {t('CheckIn').toLowerCase()}: {relativeDays(daysSince(lastCheckIn)).toLowerCase()}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function CheckInQueue({ queue, terms }) {
  const { t, tPlural } = terms;
  const due = queue.filter((k) => k.due);
  if (queue.length === 0) {
    return <div className="db-empty">No {tPlural('KeyResult').toLowerCase()} of yours to check in on yet.</div>;
  }
  if (due.length === 0) {
    return (
      <div className="db-calm">
        You&apos;re up to date. Every {t('KeyResult').toLowerCase()} has a {t('CheckIn').toLowerCase()} from the last {STALE_AFTER_DAYS} days; the oldest was {relativeDays(queue[0].daysSinceCheckIn).toLowerCase()}.
      </div>
    );
  }
  const shown = due.slice(0, 6);
  return (
    <div className="db-queue">
      {shown.map((kr) => (
        <div key={kr.id} className="db-queue-item">
          <span className="db-queue-title">{kr.title}</span>
          <Link className="db-queue-btn" to={`/objectives/${kr.objectiveId}?checkin=${kr.id}`}>Add {t('CheckIn').toLowerCase()}</Link>
          <span className="db-queue-sub">
            <span className="db-queue-age-due">{kr.daysSinceCheckIn === null ? 'Never checked in' : `Last ${relativeDays(kr.daysSinceCheckIn).toLowerCase()}`}</span>
            {' in '}{kr.objectiveTitle}
          </span>
        </div>
      ))}
      {due.length > shown.length && (
        <div className="db-section-note" style={{ paddingTop: 12 }}>and {due.length - shown.length} more</div>
      )}
    </div>
  );
}

function TeamSection({ teamProgress, terms }) {
  const { t, tPlural } = terms;
  const people = useMemo(() => {
    const map = new Map();
    for (const row of teamProgress?.rows ?? []) {
      if (!map.has(row.employeeId)) {
        map.set(row.employeeId, { id: row.employeeId, firstName: row.employeeFirstName, lastName: row.employeeLastName, keyResults: [] });
      }
      map.get(row.employeeId).keyResults.push(row);
    }
    // Rows arrive risk-sorted (reportingService.getTeamProgress), so
    // first-seen order already puts the person with the worst result first.
    return [...map.values()];
  }, [teamProgress]);

  if (!teamProgress) return null;

  return (
    <section className="db-wide">
      <div className="db-section-head">
        <h2 className="db-section-title db-display">Your team</h2>
        <Link className="db-link" to="/reports/team-progress">Team progress</Link>
      </div>
      {people.length === 0 ? (
        <div className="db-empty">None of your direct reports has a {t('KeyResult').toLowerCase()} this {t('Cycle').toLowerCase()} yet.</div>
      ) : (
        <div className="db-people">
          {people.map((p) => {
            const attention = p.keyResults.filter((kr) => ATTENTION.includes(kr.status)).length;
            const notStarted = p.keyResults.filter((kr) => kr.status === 'Not Started').length;
            const parts = [plural(p.keyResults.length, t('KeyResult').toLowerCase(), tPlural('KeyResult').toLowerCase())];
            if (attention) parts.push(`${attention} need${attention === 1 ? 's' : ''} attention`);
            if (notStarted) parts.push(`${notStarted} not started`);
            return (
              <Link key={p.id} to={`/reports/scorecard/${p.id}`} className="db-person">
                <Avatar firstName={p.firstName} lastName={p.lastName} size={34} />
                <div>
                  <div className="db-person-name">{p.firstName} {p.lastName}</div>
                  <div className="db-person-sub">{parts.join(', ')}</div>
                </div>
                <div className="db-ticks" aria-hidden="true">
                  {p.keyResults.map((kr) => <span key={kr.keyResultId} title={`${kr.keyResultTitle}: ${kr.status}`} style={{ background: statusColor(kr.status) }} />)}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

const BAR_ORDER = ['Achieved', 'On Track', 'At Risk', 'Off Track', 'Not Started'];

function OrganisationSection({ alignment, compliance, isTenantAdmin, terms }) {
  const { t, tPlural } = terms;
  if (!alignment?.cycle || alignment.objectives.length === 0) return null;

  const levels = new Map();
  for (const o of alignment.objectives) {
    if (!levels.has(o.cascadeLevelIndex)) levels.set(o.cascadeLevelIndex, { label: o.cascadeLevel, items: [] });
    levels.get(o.cascadeLevelIndex).items.push(o);
  }
  const ordered = [...levels.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);

  let done = 0, total = 0;
  for (const owner of compliance?.byOwner ?? []) {
    total += owner.keyResults.length;
    done += owner.keyResults.filter((kr) => kr.hasCheckedIn).length;
  }
  const onCourse = alignment.objectives.filter((o) => ON_COURSE.includes(o.status)).length;

  return (
    <section className="db-wide">
      <div className="db-section-head">
        <h2 className="db-section-title db-display">Across the organisation</h2>
        <Link className="db-link" to="/reports/alignment-map">Alignment map</Link>
      </div>
      <div className="db-levels">
        {ordered.map((level) => {
          const counts = new Map();
          for (const o of level.items) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
          const segments = [...BAR_ORDER.filter((s) => counts.has(s)), ...[...counts.keys()].filter((s) => !BAR_ORDER.includes(s))];
          return (
            <div key={level.label} className="db-level">
              <span className="db-level-name">{level.label}</span>
              <div className="db-bar" role="img" aria-label={segments.map((s) => `${counts.get(s)} ${s}`).join(', ')}>
                {segments.map((s) => (
                  <span key={s} title={`${counts.get(s)} ${s}`} style={{ width: `${(counts.get(s) / level.items.length) * 100}%`, background: statusColor(s) }} />
                ))}
              </div>
              <span className="db-level-count">{plural(level.items.length, t('Objective').toLowerCase(), tPlural('Objective').toLowerCase())}</span>
            </div>
          );
        })}
      </div>
      <div className="db-org-foot">
        <span><span className="db-org-figure">{onCourse}/{alignment.objectives.length}</span>{tPlural('Objective').toLowerCase()} on track or achieved</span>
        {isTenantAdmin && total > 0 && (
          <span>
            <span className="db-org-figure">{Math.round((done / total) * 100)}%</span>
            of {tPlural('KeyResult').toLowerCase()} checked in this {t('Cycle').toLowerCase()}{' '}
            <Link className="db-link" to="/reports/checkin-compliance">Compliance</Link>
          </span>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------

export default function Dashboard() {
  const { user, isManager, isTenantAdmin, isPlatformAdmin } = useRole();
  const terms = useTerms();
  const { t } = terms;

  const [scorecard, setScorecard] = useState(null);
  const [scorecardError, setScorecardError] = useState(null);
  const [teamProgress, setTeamProgress] = useState(null);
  const [alignment, setAlignment] = useState(null);
  const [compliance, setCompliance] = useState(null);

  // PlatformAdmin has no tenant — every endpoint below would 403.
  useEffect(() => {
    if (isPlatformAdmin || !user?.id) return;
    reportsApi.scorecard(user.id).then(setScorecard).catch((err) => setScorecardError(err.message ?? 'Failed to load'));
    reportsApi.alignmentMap().then(setAlignment).catch(() => setAlignment(null));
    if (isManager) reportsApi.teamProgress().then(setTeamProgress).catch(() => setTeamProgress(null));
    if (isTenantAdmin) reportsApi.checkinCompliance().then(setCompliance).catch(() => setCompliance(null));
  }, [isPlatformAdmin, isManager, isTenantAdmin, user?.id]);

  const queue = useMemo(() => {
    if (!scorecard?.objectives) return [];
    return checkInQueue(scorecard.objectives.flatMap((o) => o.keyResults.map((kr) => ({
      id: kr.id, title: kr.title, weighting: kr.weighting,
      objectiveId: o.id, objectiveTitle: o.title,
      lastCheckInAt: kr.checkInHistory.at(-1)?.submittedAt ?? null,
    }))));
  }, [scorecard]);

  if (isPlatformAdmin) {
    return (
      <div className="db">
        <section className="db-hero" data-theme="dark">
          <p className="db-greeting">{greetingFor(new Date())}{user?.firstName ? `, ${user.firstName}` : ''}</p>
          <h1 className="db-day db-display" style={{ fontSize: 'clamp(32px, 4.5vw, 48px)' }}>Platform administration</h1>
          <p className="db-summary">Tenants, feature flags and the audit trail for every organisation on WayPoint. Platform staff don&apos;t hold {t('Objective').toLowerCase()}s of their own.</p>
        </section>
        <div className="db-admin-links">
          <Link className="db-admin-link" to="/tenants"><strong>Tenants</strong><span>Provision organisations, set billing mode, export data.</span></Link>
          <Link className="db-admin-link" to="/admin/flags"><strong>Feature flags</strong><span>Switch platform capabilities on or off without a deployment.</span></Link>
          <Link className="db-admin-link" to="/audit-log"><strong>Audit log</strong><span>Every significant change, across every tenant.</span></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="db">
      {scorecardError ? (
        <div className="db-empty">Your dashboard couldn&apos;t load ({scorecardError}). Reload the page to try again.</div>
      ) : !scorecard ? (
        <div className="db-skeleton" aria-label="Loading" />
      ) : (
        <>
          <Hero user={user} scorecard={scorecard} queue={queue} isTenantAdmin={isTenantAdmin} terms={terms} />

          {scorecard.cycle && (
            <Glance scorecard={scorecard} teamProgress={teamProgress} alignment={alignment} isManager={isManager} terms={terms} />
          )}

          {scorecard.cycle && (
            <div className="db-body">
              <section>
                <div className="db-section-head">
                  <h2 className="db-section-title db-display">Your {terms.tPlural('Objective').toLowerCase()}</h2>
                  <Link className="db-link" to={`/reports/scorecard/${user.id}`}>Scorecard</Link>
                </div>
                <ObjectiveRows objectives={scorecard.objectives} terms={terms} />
              </section>
              <aside>
                <div className="db-section-head">
                  <h2 className="db-section-title db-display">Check in next</h2>
                </div>
                <CheckInQueue queue={queue} terms={terms} />
              </aside>
            </div>
          )}

          {isManager && <TeamSection teamProgress={teamProgress} terms={terms} />}
          <OrganisationSection alignment={alignment} compliance={compliance} isTenantAdmin={isTenantAdmin} terms={terms} />
        </>
      )}
    </div>
  );
}
