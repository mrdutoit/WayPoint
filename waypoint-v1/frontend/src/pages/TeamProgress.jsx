import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTerms } from '../context/TerminologyContext.jsx';
import { reportsApi } from '../services/api.js';
import { Avatar } from '../components/Avatar.jsx';
import { cycleProgress, daysSince, relativeDays, STALE_AFTER_DAYS } from '../utils/cycleMath.js';
import { formatDate } from '../utils/dateFormat.js';
import Lanes from '../components/viz/Lanes.jsx';
import StatusRing from '../components/viz/StatusRing.jsx';
import StatusBars from '../components/viz/StatusBars.jsx';
import CadenceStrip from '../components/viz/CadenceStrip.jsx';
import { StatusText, ConfidencePips } from '../components/viz/Tooltip.jsx';
import './dashboard.css';
import './reports.css';

/*
 * Team Progress (FR-033) — 2026-09-24 redesign.
 *
 * Was: one Recharts bar chart and a flat table. Now: a navy "fleet" panel
 * with one course lane per direct report (every Check-in plotted where
 * it happened, coloured by score, detail on hover); an at-a-glance row;
 * then one block per person — riskiest person first, their Key Results
 * risk-ordered — with a check-in cadence strip (the heatmap Check-in
 * Compliance has, scoped to this Manager's own reports; see
 * reportingService.getTeamProgress on why that's no new exposure).
 * Row order still comes from the server's risk sort (FR-033).
 */

const ATTENTION = ['Off Track', 'At Risk'];
const ON_COURSE = ['On Track', 'Achieved'];

function dayCounts(checkIns) {
  const map = new Map();
  for (const ci of checkIns) {
    const d = new Date(ci.submittedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].map(([date, count]) => ({ date, count }));
}

export default function TeamProgress() {
  const { t, tPlural } = useTerms();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    reportsApi.teamProgress().then(setData).catch((err) => setError(err.message ?? 'Failed to load team progress'));
  }, []);

  const people = useMemo(() => {
    if (!data?.rows) return [];
    const map = new Map();
    for (const row of data.rows) {
      if (!map.has(row.employeeId)) {
        map.set(row.employeeId, {
          id: row.employeeId, firstName: row.employeeFirstName, lastName: row.employeeLastName,
          avatarOption: row.employeeAvatarOption, keyResults: [], objectives: new Map(), checkIns: [],
        });
      }
      const p = map.get(row.employeeId);
      p.keyResults.push(row);
      p.objectives.set(row.objectiveId, { id: row.objectiveId, status: row.objectiveStatus });
    }
    for (const ci of data.checkIns ?? []) map.get(ci.employeeId)?.checkIns.push(ci);
    return [...map.values()];
  }, [data]);

  const krLabel = (n) => (n === 1 ? t('KeyResult') : tPlural('KeyResult')).toLowerCase();

  let body;
  if (error) body = <div className="db-empty">Team progress couldn&apos;t load ({error}).</div>;
  else if (!data) body = <div className="db-skeleton" aria-label="Loading" />;
  else if (!data.cycle) body = <div className="db-empty">No active {t('Cycle').toLowerCase()} right now.</div>;
  else if (people.length === 0) body = <div className="db-empty">None of your direct reports owns an {t('Objective').toLowerCase()} this {t('Cycle').toLowerCase()} yet.</div>;
  else {
    const progress = cycleProgress(data.cycle.startDate, data.cycle.endDate);
    const objectives = people.flatMap((p) => [...p.objectives.values()]);
    const onCourse = objectives.filter((o) => ON_COURSE.includes(o.status)).length;
    const attention = data.rows.filter((r) => ATTENTION.includes(r.status)).length;
    const neverChecked = data.rows.filter((r) => !r.lastCheckInAt).length;
    const quiet = people.filter((p) => {
      const last = p.checkIns.at(-1)?.submittedAt;
      return !last || daysSince(last) >= STALE_AFTER_DAYS;
    }).length;

    body = (
      <>
        <section className="db-hero" data-theme="dark">
          <h2 className="rp-hero-title">The team&apos;s passage so far</h2>
          <p className="rp-hero-note">
            {people.length} direct report{people.length === 1 ? '' : 's'}, {(data.checkIns ?? []).length} {(data.checkIns?.length === 1 ? t('CheckIn') : tPlural('CheckIn')).toLowerCase()} this {t('Cycle').toLowerCase()}. Hover a lane for detail.
          </p>
          {progress && (
            <Lanes
              cycle={data.cycle}
              progress={progress}
              lanes={people.map((p) => ({
                id: p.id,
                checkIns: p.checkIns,
                label: (
                  <Link to={`/reports/scorecard/${p.id}`} className="rp-lane-who">
                    <Avatar firstName={p.firstName} lastName={p.lastName} avatarOption={p.avatarOption} size={26} />
                    <span>{p.firstName} {p.lastName}</span>
                  </Link>
                ),
              }))}
            />
          )}
        </section>

        <div className="db-glance">
          <section className="vz-panel">
            <h2 className="vz-panel-title">Team {tPlural('Objective').toLowerCase()}</h2>
            <p className="vz-panel-note">Share on track or achieved</p>
            <StatusRing items={objectives} noun={tPlural('Objective').toLowerCase()}
              headline={{ figure: `${objectives.length ? Math.round((onCourse / objectives.length) * 100) : 0}%`, caption: 'on track or achieved' }} />
          </section>
          <section className="vz-panel">
            <h2 className="vz-panel-title">Team {tPlural('KeyResult').toLowerCase()}</h2>
            <p className="vz-panel-note">Latest score for each</p>
            <StatusBars items={data.rows} />
          </section>
          <section className="vz-panel">
            <h2 className="vz-panel-title">Where to look</h2>
            <p className="vz-panel-note">What needs a conversation</p>
            <dl className="sc-stats">
              <div><dt>{tPlural('KeyResult')} off track or at risk</dt><dd className="db-display">{attention}</dd></div>
              <div><dt>Never checked in</dt><dd className="db-display">{neverChecked}</dd></div>
              <div><dt>People quiet for {STALE_AFTER_DAYS}+ days</dt><dd className="db-display">{quiet}</dd></div>
            </dl>
          </section>
        </div>

        <section className="rp-section">
          <div className="db-section-head">
            <h2 className="db-section-title db-display">By person</h2>
            <span className="db-section-note">Riskiest first: lowest score, then lowest confidence</span>
          </div>
          <div className="rp-people">
            {people.map((p) => {
              const att = p.keyResults.filter((kr) => ATTENTION.includes(kr.status)).length;
              const last = p.checkIns.at(-1)?.submittedAt;
              return (
                <div className="rp-person" key={p.id}>
                  <div className="rp-person-head">
                    <Avatar firstName={p.firstName} lastName={p.lastName} avatarOption={p.avatarOption} size={38} />
                    <div>
                      <div className="rp-person-name">{p.firstName} {p.lastName}</div>
                      <div className="rp-person-sub">
                        {p.keyResults.length} {krLabel(p.keyResults.length)}
                        {att > 0 && <>, <span style={{ color: 'var(--warn)', fontWeight: 600 }}>{att} need{att === 1 ? 's' : ''} attention</span></>}
                        , last {t('CheckIn').toLowerCase()} {relativeDays(daysSince(last)).toLowerCase()}
                      </div>
                    </div>
                    <div className="rp-person-links"><Link className="db-link" to={`/reports/scorecard/${p.id}`}>Scorecard</Link></div>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <CadenceStrip cycle={data.cycle} checkInsByDate={dayCounts(p.checkIns)} label={`${p.firstName}'s check-ins`} />
                  </div>
                  <div className="rp-kr-list">
                    {p.keyResults.map((kr) => {
                      const age = kr.lastCheckInAt ? daysSince(kr.lastCheckInAt) : null;
                      return (
                        <div className="rp-kr" key={kr.keyResultId}>
                          <Link className="rp-kr-title" to={`/objectives/${kr.objectiveId}`} style={{ textDecoration: 'none' }}>
                            {kr.keyResultTitle}
                            <span className="rp-kr-obj">{kr.objectiveTitle}</span>
                          </Link>
                          {kr.latestConfidence != null ? <ConfidencePips value={kr.latestConfidence} /> : <span />}
                          <span className={`rp-kr-when${age === null || age >= STALE_AFTER_DAYS ? ' due' : ''}`}>{age === null ? 'Never checked in' : relativeDays(age)}</span>
                          <StatusText status={kr.status} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </>
    );
  }

  return (
    <div className="db">
      <Link to="/reports" className="db-link">&larr; Reports</Link>
      <div className="rp-head">
        <div>
          <h1 className="rp-title">Team progress</h1>
          <p className="rp-sub">Your direct reports&apos; {tPlural('Objective').toLowerCase()} and {tPlural('KeyResult').toLowerCase()}, riskiest first.</p>
        </div>
        {data?.cycle && <div className="rp-cycle"><strong>{data.cycle.name}</strong>Closes {formatDate(data.cycle.endDate)}</div>}
      </div>
      {body}
    </div>
  );
}
