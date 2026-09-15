import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import { useTerms } from '../context/TerminologyContext.jsx';
import { healthApi } from '../services/api.js';
import { s, colors } from '../styles/tokens.js';

// Real landing content, replacing the Stage 3 scaffold placeholder that
// sat here unchanged through every module built since — its own copy
// said "Objectives, Key Results, Initiatives, Check-ins, and
// Reflections are built module by module in Stage 4" long after all of
// them actually were, which is exactly the kind of stale status text
// this page shouldn't be showing anyone.
function QuickLink({ to, title, description }) {
  return (
    <Link to={to} style={{ ...s.card, textDecoration: 'none', display: 'block' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink900, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: colors.ink500 }}>{description}</div>
    </Link>
  );
}

export default function Dashboard() {
  const { user, isManager, isTenantAdmin } = useRole();
  const { tPlural } = useTerms();
  const [health, setHealth] = useState(null);

  useEffect(() => {
    healthApi.check().then(setHealth).catch(() => setHealth(null));
  }, []);

  const displayName = user?.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : user?.email;

  return (
    <div style={s.page}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: colors.ink900 }}>
        Welcome{displayName ? `, ${displayName}` : ''}
      </h1>
      <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 24 }}>
        Signed in as {user?.role}.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480, marginBottom: 24 }}>
        <QuickLink to="/objectives" title={tPlural('Objective')} description={`View and create your ${tPlural('Objective').toLowerCase()} for the current Cycle.`} />
        <QuickLink to={`/reports/scorecard/${user?.id}`} title="My scorecard" description="Your current Cycle's scores and check-in history." />
        {isManager && (
          <QuickLink to="/reports/team-progress" title="Team progress" description="Your direct reports' status, sorted by risk." />
        )}
        {isTenantAdmin && (
          <>
            <QuickLink to="/reports/alignment-map" title="Alignment map" description="The full cascade tree, company to individual." />
            <QuickLink to="/users" title="Users" description="Invite, manage roles, and reset passwords." />
          </>
        )}
      </div>

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
