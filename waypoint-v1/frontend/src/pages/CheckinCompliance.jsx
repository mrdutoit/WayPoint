import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTerms } from '../context/TerminologyContext.jsx';
import { reportsApi } from '../services/api.js';
import { Avatar } from '../components/Avatar.jsx';
import { formatDate } from '../utils/dateFormat.js';
import { monthTicks, daysSince, relativeDays, STALE_AFTER_DAYS } from '../utils/cycleMath.js';
import StatusRing from '../components/viz/StatusRing.jsx';
import CadenceStrip from '../components/viz/CadenceStrip.jsx';
import './dashboard.css';
import './reports.css';

/*
 * Check-in Compliance (FR-033, TenantAdmin) — 2026-09-24 redesign.
 *
 * Was: per-owner cards each with a 7-row calendar heatmap, stacked
 * vertically — impossible to compare one person's rhythm with another's.
 * Now: a coverage ring and headline figures, then one row per person,
 * least-covered first, with a single-row cadence strip that lines up
 * day-for-day with everyone else's under a shared month axis — gaps and
 * bursts read straight down the page. Unchecked Key Results expand per
 * person. Same data as before (reportingService.getCheckinCompliance).
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function meterColor(ratio) {
  if (ratio >= 1) return 'var(--success)';
  if (ratio >= 0.5) return 'var(--brand500)';
  return 'var(--warn)';
}

export default function CheckinCompliance() {
  const { t, tPlural } = useTerms();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    reportsApi.checkinCompliance().then(setData).catch((err) => setError(err.message ?? 'Failed to load check-in compliance'));
  }, []);

  const owners = useMemo(() => {
    if (!data?.byOwner) return [];
    return data.byOwner
      .map((o) => {
        const done = o.keyResults.filter((kr) => kr.hasCheckedIn).length;
        const lastDay = o.checkInsByDate.map((d) => String(d.date).slice(0, 10)).sort().at(-1);
        return { ...o, done, ratio: o.keyResults.length ? done / o.keyResults.length : 0, lastDay };
      })
      .sort((a, b) => a.ratio - b.ratio || (a.lastDay ?? '').localeCompare(b.lastDay ?? ''));
  }, [data]);

  const krWord = (n) => (n === 1 ? t('KeyResult') : tPlural('KeyResult')).toLowerCase();

  let body;
  if (error) body = <div className="db-empty">Check-in compliance couldn&apos;t load ({error}).</div>;
  else if (!data) body = <div className="db-skeleton" aria-label="Loading" />;
  else if (!data.cycle) body = <div className="db-empty">No active {t('Cycle').toLowerCase()} right now.</div>;
  else if (owners.length === 0) body = <div className="db-empty">Nobody owns a {t('KeyResult').toLowerCase()} this {t('Cycle').toLowerCase()} yet.</div>;
  else {
    const totalKrs = owners.reduce((s, o) => s + o.keyResults.length, 0);
    const doneKrs = owners.reduce((s, o) => s + o.done, 0);
    const fullyCovered = owners.filter((o) => o.ratio >= 1).length;
    const totalCheckIns = owners.reduce((s, o) => s + o.checkInsByDate.reduce((x, d) => x + Number(d.count), 0), 0);
    const quiet = owners.filter((o) => !o.lastDay || daysSince(`${o.lastDay}T12:00:00`) >= STALE_AFTER_DAYS).length;
    const ticks = monthTicks(data.cycle.startDate, data.cycle.endDate);

    body = (
      <>
        <div className="db-glance">
          <section className="vz-panel">
            <h2 className="vz-panel-title">Coverage</h2>
            <p className="vz-panel-note">{tPlural('KeyResult')} with at least one {t('CheckIn').toLowerCase()} this {t('Cycle').toLowerCase()}</p>
            <StatusRing
              noun={tPlural('KeyResult').toLowerCase()}
              groups={[
                { status: 'Checked in', count: doneKrs, color: 'var(--success)' },
                { status: 'Not yet', count: totalKrs - doneKrs, color: 'var(--ink300)' },
              ]}
              headline={{ figure: `${totalKrs ? Math.round((doneKrs / totalKrs) * 100) : 0}%`, caption: 'checked in' }}
            />
          </section>
          <section className="vz-panel">
            <h2 className="vz-panel-title">People</h2>
            <p className="vz-panel-note">Owners of at least one {t('KeyResult').toLowerCase()}</p>
            <dl className="sc-stats">
              <div><dt>Fully checked in</dt><dd className="db-display">{fullyCovered}<small style={{ fontSize: 14, color: 'var(--ink500)', fontWeight: 500 }}> / {owners.length}</small></dd></div>
              <div><dt>Quiet for {STALE_AFTER_DAYS}+ days</dt><dd className="db-display">{quiet}</dd></div>
            </dl>
          </section>
          <section className="vz-panel">
            <h2 className="vz-panel-title">Volume</h2>
            <p className="vz-panel-note">Everything recorded this {t('Cycle').toLowerCase()}</p>
            <dl className="sc-stats">
              <div><dt>{tPlural('CheckIn')}</dt><dd className="db-display">{totalCheckIns}</dd></div>
              <div><dt>Per {t('KeyResult').toLowerCase()}, on average</dt><dd className="db-display">{totalKrs ? (totalCheckIns / totalKrs).toFixed(1) : '0'}</dd></div>
            </dl>
          </section>
        </div>

        <section className="rp-section">
          <div className="db-section-head">
            <h2 className="db-section-title db-display">By person</h2>
            <span className="db-section-note">Least covered first. Each strip is one day per cell; hover for the count</span>
          </div>
          <div className="rp-people">
            <div className="rp-comp rp-comp-axis" aria-hidden="true">
              <span>Person</span>
              <span>{tPlural('KeyResult')} checked in</span>
              <div className="rp-axis-months">
                <span style={{ left: 0, transform: 'none' }}>{formatDate(data.cycle.startDate)}</span>
                {ticks.filter((tk) => tk.fraction > 0.14 && tk.fraction < 0.86).map((tk) => (
                  <span key={tk.date.toISOString()} style={{ left: `${tk.fraction * 100}%` }}>{MONTHS[tk.date.getMonth()]}</span>
                ))}
                <span style={{ right: 0, left: 'auto', transform: 'none' }}>{formatDate(data.cycle.endDate)}</span>
              </div>
              <span style={{ textAlign: 'right' }}>Last</span>
            </div>
            {owners.map((o) => {
              const missing = o.keyResults.filter((kr) => !kr.hasCheckedIn);
              return (
                <div className="rp-comp" key={o.employeeId}>
                  <div className="rp-comp-who">
                    <Avatar firstName={o.employeeFirstName} lastName={o.employeeLastName} avatarOption={o.employeeAvatarOption} size={32} />
                    <Link to={`/reports/scorecard/${o.employeeId}`} className="rp-person-name" style={{ textDecoration: 'none', fontSize: 14.5 }}>
                      {o.employeeFirstName} {o.employeeLastName}
                    </Link>
                  </div>
                  <div className="rp-comp-ratio">
                    <strong>{o.done}/{o.keyResults.length}</strong>{krWord(o.keyResults.length)}
                    <div className="rp-meter"><span style={{ width: `${Math.max(o.ratio * 100, 3)}%`, background: meterColor(o.ratio) }} /></div>
                  </div>
                  <CadenceStrip cycle={data.cycle} checkInsByDate={o.checkInsByDate} label={`${o.employeeFirstName}'s check-ins`} />
                  <div className="rp-comp-last">{o.lastDay ? relativeDays(daysSince(`${o.lastDay}T12:00:00`)) : 'Never'}</div>
                  {missing.length > 0 && (
                    <details className="rp-comp-missing">
                      <summary>{missing.length} {krWord(missing.length)} without a {t('CheckIn').toLowerCase()}</summary>
                      <ul>{missing.map((kr) => <li key={kr.keyResultId}>{kr.keyResultTitle}</li>)}</ul>
                    </details>
                  )}
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
          <h1 className="rp-title">Check-in compliance</h1>
          <p className="rp-sub">Who is keeping their {tPlural('KeyResult').toLowerCase()} current this {t('Cycle').toLowerCase()}, and who has gone quiet. The main lever for adoption.</p>
        </div>
        {data?.cycle && <div className="rp-cycle"><strong>{data.cycle.name}</strong>Closes {formatDate(data.cycle.endDate)}</div>}
      </div>
      {body}
    </div>
  );
}
