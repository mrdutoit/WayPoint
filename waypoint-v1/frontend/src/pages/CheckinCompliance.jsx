import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { useTerms } from '../context/TerminologyContext.jsx';
import { reportsApi } from '../services/api.js';
import { s, colors } from '../styles/tokens.js';
import StatusDonut from '../components/charts/StatusDonut.jsx';
import CalendarHeatmap from '../components/charts/CalendarHeatmap.jsx';

export default function CheckinCompliance() {
  const { isMobile } = useWindowSize();
  const { t, tPlural } = useTerms();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    reportsApi.checkinCompliance().then(setData).catch((err) => setError(err.message ?? 'Failed to load check-in compliance'));
  }, []);

  const pageStyle = isMobile ? s.pageMobile : s.page;
  if (error) return <div style={pageStyle}><div style={s.chip(colors.danger, colors.dangerBg)}>{error}</div></div>;
  if (!data) return <div style={pageStyle}><p style={{ fontSize: 13, color: colors.ink500 }}>Loading…</p></div>;

  return (
    <div style={pageStyle}>
      <Link to="/reports" style={{ fontSize: 13, color: colors.brand600, textDecoration: 'none' }}>&larr; Reports</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 8, marginBottom: 4, color: colors.ink900 }}>{tPlural('CheckIn')} compliance</h1>

      {!data.cycle ? (
        <p style={{ fontSize: 13, color: colors.ink500 }}>No active Cycle right now.</p>
      ) : (
        <>
          <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 20 }}>
            {data.cycle.name} — has each {t('KeyResult').toLowerCase()} received at least one {t('CheckIn').toLowerCase()} this Cycle.
          </p>

          {data.byOwner.length === 0 ? (
            <p style={{ fontSize: 13, color: colors.ink500 }}>No {tPlural('KeyResult').toLowerCase()} this Cycle.</p>
          ) : (
            <>
              <div style={{ ...s.card, maxWidth: 360, marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink900, marginBottom: 12 }}>
                  Overall compliance
                </div>
                <StatusDonut
                  data={(() => {
                    const all = data.byOwner.flatMap((owner) => owner.keyResults);
                    const done = all.filter((kr) => kr.hasCheckedIn).length;
                    return [
                      { status: 'Checked in', count: done },
                      { status: 'Missing', count: all.length - done },
                    ];
                  })()}
                  centerLabel={tPlural('KeyResult').toLowerCase()}
                  colorFor={(status) => (status === 'Checked in' ? colors.success : colors.warn)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 12, color: colors.ink500 }}>
                <span>Cadence:</span>
                <span>Less</span>
                {[0, 1, 2, 3].map((n) => (
                  <span key={n} style={{
                    width: 11, height: 11, borderRadius: 2,
                    background: n === 0 ? colors.ink100
                      : n === 1 ? `color-mix(in srgb, ${colors.success} 40%, ${colors.ink100})`
                      : n === 2 ? `color-mix(in srgb, ${colors.success} 70%, ${colors.ink100})`
                      : colors.success,
                  }} />
                ))}
                <span>More</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {data.byOwner.map((owner) => {
                  const total = owner.keyResults.length;
                  const done = owner.keyResults.filter((kr) => kr.hasCheckedIn).length;
                  return (
                    <div key={owner.employeeId} style={s.card}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: colors.ink900 }}>{owner.employeeFirstName} {owner.employeeLastName}</span>
                        <span style={s.chip(done === total ? colors.success : colors.warn, done === total ? colors.successBg : colors.warnBg)}>
                          {done}/{total} checked in
                        </span>
                      </div>

                      <div style={{ marginBottom: 12, overflowX: 'auto' }}>
                        <CalendarHeatmap
                          startDate={data.cycle.startDate}
                          endDate={data.cycle.endDate}
                          checkInsByDate={owner.checkInsByDate}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {owner.keyResults.map((kr) => (
                          <div key={kr.keyResultId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {kr.hasCheckedIn
                              ? <span style={{ color: colors.success, fontSize: 13 }}>✓</span>
                              : <span style={{ color: colors.danger, fontSize: 13 }}>✗</span>}
                            <span style={{ fontSize: 13, color: colors.ink700 }}>{kr.keyResultTitle}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
