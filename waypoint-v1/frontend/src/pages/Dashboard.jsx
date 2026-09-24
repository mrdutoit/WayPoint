import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import { useTerms } from '../context/TerminologyContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { objectivesApi, reportsApi } from '../services/api.js';
import { s, colors, radius } from '../styles/tokens.js';
import { groupByStatus } from '../utils/statusGroups.js';
import StatCard from '../components/charts/StatCard.jsx';
import StatusDonut from '../components/charts/StatusDonut.jsx';
import StatusBarChart from '../components/charts/StatusBarChart.jsx';
import {
  TargetIcon, AlertIcon, TrophyIcon, UsersIcon, CheckCircleIcon, ClipboardIcon, SitemapIcon,
} from '../components/charts/icons.jsx';

// Real landing content, replacing the Stage 3 scaffold placeholder that
// sat here unchanged through every module built since.
//
// 2026-09-16: rebuilt as a role-aware analytics dashboard, moving away
// from the generic "SaaS-card kit" pattern (identical boxes, ALL-CAPS
// labels, no hierarchy) toward one hero with real visual weight and
// everything else demoted beneath it.
//
// 2026-09-24: second pass, explicitly instructed rather than assumed —
// the first pass was a genuine improvement in structure but still read
// flat: same card treatment everywhere, no depth, nothing interactive.
// This pass adds actual materiality (a soft radial glow behind the
// hero, not just a flat card), a real hover response on every
// clickable surface (`.wp-lift` in index.css — transform-only, see its
// own comment for why box-shadow wasn't usable here), and reworks the
// quick-links list to share the same icon-led visual language as the
// stat row above it, rather than two different card idioms on one
// page. Still no new backend — same three endpoints as before.

function QuickLink({ to, icon: Icon, title, description }) {
  return (
    <Link
      to={to} className="wp-lift"
      style={{
        ...s.card, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 14,
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: radius.sm, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: colors.brand600, background: `color-mix(in srgb, ${colors.brand600} 12%, transparent)`,
      }}>
        <Icon size={19} />
      </div>
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink900 }}>{title}</div>
        <div style={{ fontSize: 13, color: colors.ink500 }}>{description}</div>
      </div>
      <div style={{ color: colors.ink400, fontSize: 18, flexShrink: 0 }}>&rarr;</div>
    </Link>
  );
}

// Thin circular progress ring for the one hero number on the page —
// deliberately the only place on this screen that gets this treatment.
function ProgressRing({ pct, size = 108, stroke = 10, accent }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0, filter: `drop-shadow(0 2px 6px color-mix(in srgb, ${accent} 35%, transparent))` }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={colors.ink200} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={accent} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, fontWeight: 800, color: colors.ink900, fontVariantNumeric: 'tabular-nums',
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

  const [objectives, setObjectives] = useState(null);
  const [teamProgress, setTeamProgress] = useState(null);
  const [compliance, setCompliance] = useState(null);

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
      <h1 style={{ fontSize: 23, fontWeight: 700, marginBottom: 4, color: colors.ink900, letterSpacing: '-0.01em' }}>
        Welcome{displayName ? `, ${displayName}` : ''}
      </h1>
      <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 24 }}>
        Signed in as {user?.role}.
      </p>

      {isPlatformAdmin ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480, marginBottom: 24 }}>
          <QuickLink to="/tenants" icon={UsersIcon} title="Tenants" description="Provision new tenants and manage billing mode." />
          <QuickLink to="/admin/flags" icon={TargetIcon} title="Feature flags" description="Enable or disable platform-wide capabilities." />
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
              {/* Hero — the one place this page spends visual weight. A soft
                  radial glow behind the ring (not a flat card) gives it real
                  depth rather than just being a bigger version of every
                  other box on the page. */}
              <div style={{ ...s.card, padding: 28, position: 'relative', overflow: 'hidden', marginBottom: 16 }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                  background: `linear-gradient(90deg, ${colors.brand500}, ${colors.brand700})`,
                }} />
                <div style={{
                  position: 'absolute', top: '-30%', left: '-10%', width: 360, height: 360,
                  background: `radial-gradient(circle, color-mix(in srgb, ${colors.brand500} 14%, transparent) 0%, transparent 70%)`,
                  pointerEvents: 'none',
                }} />
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
                  <ProgressRing pct={healthPct ?? 0} accent={colors.brand600} />
                  <div style={{ minWidth: 180 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink900 }}>On track or achieved</div>
                    <div style={{ fontSize: 13, color: colors.ink500 }}>
                      {healthyCount} of {objectives.length} {tPlural('Objective').toLowerCase()} this Cycle
                    </div>
                  </div>
                  <div style={{ flex: '1 1 200px', minWidth: 200 }}>
                    <StatusDonut data={objectiveStatusData} height={140} />
                  </div>
                </div>

                <div style={{
                  position: 'relative', display: 'flex', flexWrap: 'wrap', gap: '20px 32px',
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
                    <div className="wp-lift" style={s.card}>
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
                    <div className="wp-lift" style={s.card}>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
            <QuickLink to="/objectives" icon={TargetIcon} title={tPlural('Objective')} description={`View and create your ${tPlural('Objective').toLowerCase()} for the current Cycle.`} />
            <QuickLink to={`/reports/scorecard/${user?.id}`} icon={ClipboardIcon} title="My scorecard" description="Your current Cycle's scores and check-in history." />
            <QuickLink to="/reports/alignment-map" icon={SitemapIcon} title="Alignment map" description="The full cascade tree, company to individual." />
            {isTenantAdmin && (
              <QuickLink to="/users" icon={UsersIcon} title="Users" description="Invite, manage roles, and reset passwords." />
            )}
          </div>
        </>
      )}
    </div>
  );
}
