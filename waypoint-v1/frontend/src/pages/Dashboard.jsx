import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import { useTerms } from '../context/TerminologyContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { healthApi, objectivesApi, reportsApi } from '../services/api.js';
import { s, colors } from '../styles/tokens.js';
import { groupByStatus } from '../utils/statusGroups.js';
import StatCard from '../components/charts/StatCard.jsx';
import StatusDonut from '../components/charts/StatusDonut.jsx';
import StatusBarChart from '../components/charts/StatusBarChart.jsx';
import { TargetIcon, AlertIcon, TrophyIcon, UsersIcon, CheckCircleIcon } from '../components/charts/icons.jsx';

// Real landing content, replacing the Stage 3 scaffold placeholder that
// sat here unchanged through every module built since.
//
// 2026-09-16: rebuilt as a role-aware analytics dashboard. First pass
// (same day) used identical stat-card boxes for every number and an
// ALL-CAPS eyebrow label on each — exactly the generic "SaaS-card kit"
// pattern (uniform radius/shadow, no hierarchy) the frontend-design
// skill names as a default to avoid. Rebuilt around one clear hero
// (the on-track/achieved ring + status donut, in one card with its own
// visual weight) with everything else demoted to a lighter, icon-led
// metric row beneath it, rather than a grid of competing equal boxes.
// Still no new backend — same three endpoints as before.

function QuickLink({ to, title, description }) {
  return (
    <Link to={to} style={{ ...s.card, textDecoration: 'none', display: 'block' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink900, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: colors.ink500 }}>{description}</div>
    </Link>
  );
}

// Thin circular progress ring for the one hero number on the page —
// deliberately the only place on this screen that gets this treatment.
function ProgressRing({ pct, size = 92, stroke = 9, accent }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={colors.ink200} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={accent} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, fontWeight: 700, color: colors.ink900,
      }}>
        {pct}%
      </div>
    </div>
  );
}

const ATTENTION_STATUSES = ['Off Track', 'At Risk'];

export default function Dashboard() {
  const { user, isManager, isTenantAdmin, isPlatformAdmin } = useRole();
  const { t, tPlural } = useTerms();
  const { isMobile } = useWindowSize();
  const pageStyle = isMobile ? s.pageMobile : s.page;

  const [health, setHealth] = useState(null);
  const [objectives, setObjectives] = useState(null);
  const [teamProgress, setTeamProgress] = useState(null);
  const [compliance, setCompliance] = useState(null);

  useEffect(() => {
    healthApi.check().then(setHealth).catch(() => setHealth(null));
  }, []);

  // PlatformAdmin has no tenantId — every endpoint below 403s for them
  // (see objectives-router.js/reports-router.js), so this section is
  // skipped entirely rather than firing requests that can only fail.
  useEffect(() => {
    if (isPlatformAdmin) return;
    objectivesApi.list().then((r) => setObjectives(r?.objectives ?? [])).catch(() => setObjectives([]));
    if (isManager) reportsApi.teamProgress().then(setTeamProgress).catch(() => setTeamProgress(null));
    if (isTenantAdmin) reportsApi.checkinCompliance().then(setCompliance).catch(() => setCompliance(null));
  }, [isPlatformAdmin, isManager, isTenantAdmin]);

  const displayName = user?.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : user?.email;

  const objectiveStatusData = objectives ? groupByStatus(objectives) : [];
  const attentionCount = objectives ? objectives.filter((o) => ATTENTION_STATUSES.includes(o.status)).length : 0;
  const achievedCount = objectives ? objectives.filter((o) => o.status === 'Achieved').length : 0;
  const healthyCount = objectives ? objectives.filter((o) => o.status === 'On Track' || o.status === 'Achieved').length : 0;
  const healthPct = objectives && objectives.length > 0 ? Math.round((healthyCount / objectives.length) * 100) : null;

  const teamStatusData = teamProgress?.rows ? groupByStatus(teamProgress.rows) : [];
  const teamAttentionCount = teamProgress?.rows ? teamProgress.rows.filter((r) => ATTENTION_STATUSES.includes(r.status)).length : 0;

  let complianceDone = 0, complianceTotal = 0;
  if (compliance?.byOwner) {
    for (const owner of compliance.byOwner) {
      complianceTotal += owner.keyResults.length;
      complianceDone += owner.keyResults.filter((kr) => kr.hasCheckedIn).length;
    }
  }
  const compliancePct = complianceTotal > 0 ? Math.round((complianceDone / complianceTotal) * 100) : null;

  return (
    <div style={pageStyle}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: colors.ink900 }}>
        Welcome{displayName ? `, ${displayName}` : ''}
      </h1>
      <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 24 }}>
        Signed in as {user?.role}.
      </p>

      {isPlatformAdmin ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480, marginBottom: 24 }}>
          <QuickLink to="/tenants" title="Tenants" description="Provision new tenants and manage billing mode." />
          <QuickLink to="/admin/flags" title="Feature flags" description="Enable or disable platform-wide capabilities." />
        </div>
      ) : (
        <>
          {objectives === null ? (
            <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 24 }}>Loading…</p>
          ) : objectives.length === 0 ? (
            <div style={{ ...s.card, marginBottom: 24 }}>
              <div style={{ fontSize: 14, color: colors.ink500 }}>
                No {tPlural('Objective').toLowerCase()} this Cycle yet — create one to see it here.
              </div>
            </div>
          ) : (
            <>
              {/* Hero — the one place this page spends visual weight */}
              <div style={{ ...s.card, padding: 28, position: 'relative', overflow: 'hidden', marginBottom: 16 }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                  background: `linear-gradient(90deg, ${colors.brand500}, ${colors.brand700})`,
                }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
                  <ProgressRing pct={healthPct ?? 0} accent={colors.brand600} />
                  <div style={{ minWidth: 180 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink900 }}>On track or achieved</div>
                    <div style={{ fontSize: 13, color: colors.ink500 }}>
                      {healthyCount} of {objectives.length} {tPlural('Objective').toLowerCase()} this Cycle
                    </div>
                  </div>
                  <div style={{ flex: '1 1 200px', minWidth: 200 }}>
                    <StatusDonut data={objectiveStatusData} height={140} />
                  </div>
                </div>

                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: '20px 32px',
                  marginTop: 24, paddingTop: 20, borderTop: `1px solid ${colors.line}`,
                }}>
                  <StatCard icon={TargetIcon} label={tPlural('Objective')} value={objectives.length} accent={colors.brand600} />
                  <StatCard icon={AlertIcon} label="Off track or at risk" value={attentionCount} accent={colors.warn} />
                  <StatCard icon={TrophyIcon} label="Achieved" value={achievedCount} accent={colors.success} />
                  {isTenantAdmin && compliancePct !== null && (
                    <StatCard
                      icon={CheckCircleIcon}
                      label={`${tPlural('CheckIn')} compliance`}
                      value={`${compliancePct}%`}
                      accent={compliancePct === 100 ? colors.success : colors.warn}
                    />
                  )}
                </div>
              </div>

              {(isManager || isTenantAdmin) && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 16, marginBottom: 24,
                }}>
                  {isManager && (
                    <div style={s.card}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <UsersIcon size={16} />
                          <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink900 }}>Team {t('KeyResult').toLowerCase()} status</span>
                        </div>
                        <Link to="/reports/team-progress" style={{ fontSize: 12, color: colors.brand600, textDecoration: 'none' }}>View all &rarr;</Link>
                      </div>
                      {teamProgress === null ? (
                        <div style={{ fontSize: 13, color: colors.ink500, padding: '32px 0', textAlign: 'center' }}>Loading…</div>
                      ) : (
                        <>
                          <StatusBarChart data={teamStatusData} height={180} />
                          {teamAttentionCount > 0 && (
                            <div style={{ fontSize: 12, color: colors.warn, marginTop: 8 }}>
                              {teamAttentionCount} {teamAttentionCount === 1 ? 'result needs' : 'results need'} attention
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {isTenantAdmin && (
                    <div style={s.card}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <CheckCircleIcon size={16} />
                          <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink900 }}>{tPlural('CheckIn')} compliance</span>
                        </div>
                        <Link to="/reports/checkin-compliance" style={{ fontSize: 12, color: colors.brand600, textDecoration: 'none' }}>View all &rarr;</Link>
                      </div>
                      {compliance === null ? (
                        <div style={{ fontSize: 13, color: colors.ink500, padding: '32px 0', textAlign: 'center' }}>Loading…</div>
                      ) : (
                        <StatusDonut
                          data={[
                            { status: 'Checked in', count: complianceDone },
                            { status: 'Missing', count: complianceTotal - complianceDone },
                          ]}
                          centerLabel={tPlural('KeyResult').toLowerCase()}
                          colorFor={(status) => (status === 'Checked in' ? colors.success : colors.warn)}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480, marginBottom: 24 }}>
            <QuickLink to="/objectives" title={tPlural('Objective')} description={`View and create your ${tPlural('Objective').toLowerCase()} for the current Cycle.`} />
            <QuickLink to={`/reports/scorecard/${user?.id}`} title="My scorecard" description="Your current Cycle's scores and check-in history." />
            <QuickLink to="/reports/alignment-map" title="Alignment map" description="The full cascade tree, company to individual." />
            {isTenantAdmin && (
              <QuickLink to="/users" title="Users" description="Invite, manage roles, and reset passwords." />
            )}
          </div>
        </>
      )}

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink700, marginBottom: 8 }}>API health</div>
        {health ? (
          <span style={s.chip(colors.success, colors.successBg)}>
            {health.status} — database {health.database}
          </span>
        ) : (
          <span style={s.chip(colors.ink500, colors.ink100)}>Checking…</span>
        )}
      </div>
    </div>
  );
}
