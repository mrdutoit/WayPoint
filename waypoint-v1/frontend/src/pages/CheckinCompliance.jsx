import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { useTerms } from '../context/TerminologyContext.jsx';
import { reportsApi } from '../services/api.js';
import { s, colors } from '../styles/tokens.js';

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
          )}
        </>
      )}
    </div>
  );
}
