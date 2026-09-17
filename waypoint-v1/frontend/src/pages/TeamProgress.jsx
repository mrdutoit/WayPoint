import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { useTerms } from '../context/TerminologyContext.jsx';
import { reportsApi } from '../services/api.js';
import { s, colors, STATUS_META } from '../styles/tokens.js';
import { groupByStatus } from '../utils/statusGroups.js';
import StatusBarChart from '../components/charts/StatusBarChart.jsx';

function StatusChip({ status }) {
  const meta = STATUS_META[status] ?? { color: colors.ink500, bg: colors.ink100 };
  return <span style={s.chip(meta.color, meta.bg)}>{status}</span>;
}

export default function TeamProgress() {
  const { isMobile } = useWindowSize();
  const { t, tPlural } = useTerms();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    reportsApi.teamProgress().then(setData).catch((err) => setError(err.message ?? 'Failed to load team progress'));
  }, []);

  const pageStyle = isMobile ? s.pageMobile : s.page;
  if (error) return <div style={pageStyle}><div style={s.chip(colors.danger, colors.dangerBg)}>{error}</div></div>;
  if (!data) return <div style={pageStyle}><p style={{ fontSize: 13, color: colors.ink500 }}>Loading…</p></div>;

  return (
    <div style={pageStyle}>
      <Link to="/reports" style={{ fontSize: 13, color: colors.brand600, textDecoration: 'none' }}>&larr; Reports</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 8, marginBottom: 4, color: colors.ink900 }}>Team progress</h1>

      {!data.cycle ? (
        <p style={{ fontSize: 13, color: colors.ink500 }}>No active Cycle right now.</p>
      ) : (
        <>
          <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 20 }}>
            {data.cycle.name} — sorted by risk, lowest score/confidence first.
          </p>

          {data.rows.length === 0 ? (
            <p style={{ fontSize: 13, color: colors.ink500 }}>No direct reports with {tPlural('Objective').toLowerCase()} this Cycle.</p>
          ) : (
            <>
              <div style={{ ...s.card, maxWidth: 420, marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink900, marginBottom: 12 }}>
                  {tPlural('KeyResult')} by status
                </div>
                <StatusBarChart data={groupByStatus(data.rows)} />
              </div>

              <div style={s.tableCard}>
                <table style={{ ...s.table, minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th style={s.th}>Employee</th>
                      <th style={s.th}>{t('Objective')}</th>
                      <th style={s.th}>{t('KeyResult')}</th>
                      <th style={s.th}>Status</th>
                      <th style={s.th}>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.keyResultId}>
                        <td style={s.td}>{row.employeeFirstName} {row.employeeLastName}</td>
                        <td style={s.td}>{row.objectiveTitle}</td>
                        <td style={s.td}>{row.keyResultTitle}</td>
                        <td style={s.td}><StatusChip status={row.status} /></td>
                        <td style={s.td}>{row.latestConfidence != null ? `${row.latestConfidence}/5` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
