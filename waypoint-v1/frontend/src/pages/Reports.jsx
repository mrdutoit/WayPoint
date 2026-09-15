import { Link } from 'react-router-dom';
import { useRole } from '../context/RoleContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { s, colors } from '../styles/tokens.js';

function ReportLink({ to, title, description }) {
  return (
    <Link to={to} style={{ ...s.card, textDecoration: 'none', display: 'block' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink900, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: colors.ink500 }}>{description}</div>
    </Link>
  );
}

export default function Reports() {
  const { user, isManager, isTenantAdmin } = useRole();
  const { isMobile } = useWindowSize();

  return (
    <div style={isMobile ? s.pageMobile : s.page}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: colors.ink900 }}>Reports</h1>
      <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 24 }}>
        Available reports for your role, computed against the current Cycle.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
        <ReportLink
          to={`/reports/scorecard/${user?.id}`}
          title="My scorecard"
          description="Your current Cycle's Objectives and Key Results, scores, and check-in history."
        />
        {isManager && (
          <ReportLink
            to="/reports/team-progress"
            title="Team progress"
            description="Your direct reports' Objective and Key Result status, sorted by risk."
          />
        )}
        {isTenantAdmin && (
          <>
            <ReportLink
              to="/reports/alignment-map"
              title="Alignment map"
              description="The full cascade tree, company to individual, with roll-up scores at each level."
            />
            <ReportLink
              to="/reports/checkin-compliance"
              title="Check-in compliance"
              description="Who has checked in this Cycle and who hasn't."
            />
          </>
        )}
      </div>
    </div>
  );
}
