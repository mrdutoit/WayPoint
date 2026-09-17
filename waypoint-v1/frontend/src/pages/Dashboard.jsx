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

// Real landing content, replacing the Stage 3 scaffold placeholder that
// sat here unchanged through every module built since — its own copy
// said "Objectives, Key Results, Initiatives, Check-ins, and
// Reflections are built module by module in Stage 4" long after all of
// them actually were, which is exactly the kind of stale status text
// this page shouldn't be showing anyone.
//
// 2026-09-16: rebuilt as a role-aware analytics dashboard (Perdoo/
// ClickUp comparison backlog item — "chart-based dashboards"). No new
// backend — everything here is computed client-side from endpoints that
// already exist (GET /api/objectives, team-progress, checkin-compliance),
// same data the plain-table reports already show, just visualised.

function QuickLink({ to, title, description }) {
  return (
    <Link to={to} style={{ ...s.card, textDecoration: 'none', display: 'block' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink900, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: colors.ink500 }}>{description}</div>
    </Link>
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
          ) : (
            <>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                <StatCard label={tPlural('Objective')} value={objectives.length} />
                <StatCard label="Needs attention" value={attentionCount} accent={colors.warn} sublabel="Off Track / At Risk" />
                <StatCard label="Achieved" value={achievedCount} accent={colors.success} />
                {isTenantAdmin && compliancePct !== null && (
                  <StatCard
                    label={`${tPlural('CheckIn')} compliance`}
                    value={`${compliancePct}%`}
                    accent={complianceDone === complianceTotal ? colors.success : colors.warn}
                    sublabel={`${complianceDone}/${complianceTotal} ${tPlural('KeyResult').toLowerCase()}`}
                  />
                )}
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 16, marginBottom: 24,
              }}>
                <div style={s.card}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink900, marginBottom: 12 }}>
                    {tPlural('Objective')} by status
                  </div>
                  <StatusDonut data={objectiveStatusData} centerLabel={tPlural('Objective').toLowerCase()} />
                </div>

                {isManager && (
                  <div style={s.card}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink900 }}>Team {t('KeyResult').toLowerCase()} status</div>
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink900 }}>{tPlural('CheckIn')} compliance</div>
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
