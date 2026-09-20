import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { useTerms } from '../context/TerminologyContext.jsx';
import { reportsApi } from '../services/api.js';
import { s, colors, STATUS_META } from '../styles/tokens.js';
import WeightingTreemap from '../components/charts/WeightingTreemap.jsx';
import Sparkline from '../components/charts/Sparkline.jsx';

function StatusChip({ status }) {
  const meta = STATUS_META[status] ?? { color: colors.ink500, bg: colors.ink100 };
  return <span style={s.chip(meta.color, meta.bg)}>{status}</span>;
}

export default function Scorecard() {
  const { userId } = useParams();
  const { isMobile } = useWindowSize();
  const { t, tPlural } = useTerms();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    reportsApi.scorecard(userId)
      .then(setData)
      .catch((err) => {
        if (err.status === 403) setForbidden(true);
        else setError(err.message ?? 'Failed to load scorecard');
      });
  }, [userId]);

  const pageStyle = isMobile ? s.pageMobile : s.page;
  if (forbidden) return <div style={pageStyle}><p style={{ color: colors.ink500 }}>You don't have access to this scorecard.</p></div>;
  if (error) return <div style={pageStyle}><div style={s.chip(colors.danger, colors.dangerBg)}>{error}</div></div>;
  if (!data) return <div style={pageStyle}><p style={{ fontSize: 13, color: colors.ink500 }}>Loading…</p></div>;

  return (
    <div style={pageStyle}>
      <Link to="/reports" style={{ fontSize: 13, color: colors.brand600, textDecoration: 'none' }}>&larr; Reports</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 8, marginBottom: 4, color: colors.ink900 }}>Scorecard</h1>

      {!data.cycle ? (
        <p style={{ fontSize: 13, color: colors.ink500 }}>No active Cycle right now.</p>
      ) : (
        <>
          <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 20 }}>{data.cycle.name}</p>

          {data.objectives.length === 0 && (
            <p style={{ fontSize: 13, color: colors.ink500 }}>No {tPlural('Objective').toLowerCase()} this Cycle.</p>
          )}

          {data.objectives.length > 0 && (
            <div style={{ ...s.card, maxWidth: 560, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink900, marginBottom: 4 }}>
                {tPlural('KeyResult')} by weighting
              </div>
              <div style={{ fontSize: 12, color: colors.ink500, marginBottom: 12 }}>
                Size = weighting (FR-016), colour = status — bigger blocks matter more to the {t('Objective').toLowerCase()}'s score.
              </div>
              <WeightingTreemap
                data={data.objectives.flatMap((o) => o.keyResults).map((kr) => ({
                  name: kr.title, size: Number(kr.weighting), status: kr.status,
                }))}
              />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {data.objectives.map((obj) => (
              <div key={obj.id} style={s.card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: colors.ink900 }}>{obj.title}</span>
                  <StatusChip status={obj.status} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {obj.keyResults.map((kr) => (
                    <div key={kr.id} style={{ padding: 10, borderRadius: 8, border: `1px solid ${colors.line}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, color: colors.ink900, flex: '1 1 auto' }}>{kr.title}</span>
                        {kr.confidenceTrend.length > 0 && (
                          <Sparkline
                            values={kr.confidenceTrend.map((c) => c.confidence)}
                            accent={STATUS_META[kr.status]?.color ?? colors.brand600}
                          />
                        )}
                        <StatusChip status={kr.status} />
                      </div>
                      {kr.checkInHistory.length === 0 ? (
                        <div style={{ fontSize: 12, color: colors.ink400 }}>No {tPlural('CheckIn').toLowerCase()} yet.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {kr.checkInHistory.slice().reverse().map((ci, idx) => (
                            <div key={idx} style={{ fontSize: 12, color: colors.ink500 }}>
                              {new Date(ci.submittedAt).toLocaleDateString()} — <strong style={{ color: colors.ink700 }}>{ci.scoreLabel}</strong>, confidence {ci.confidence}/5
                              {ci.comment && <span> — "{ci.comment}"</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
