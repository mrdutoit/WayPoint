import { useEffect, useState } from 'react';
import { useRole } from '../context/RoleContext.jsx';
import { healthApi } from '../services/api.js';
import { s, colors } from '../styles/tokens.js';

export default function Dashboard() {
  const { user, role } = useRole();
  const [health, setHealth] = useState(null);

  useEffect(() => {
    healthApi.check().then(setHealth);
  }, []);

  return (
    <div style={s.page}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: colors.ink900 }}>
        Welcome{user?.email ? `, ${user.email}` : ''}
      </h1>
      <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 20 }}>
        Signed in as {role}. This is the Stage 3 scaffold — Objectives, Key Results, Initiatives, Check-ins,
        and Reflections are built module by module in Stage 4.
      </p>

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink700, marginBottom: 8 }}>API health</div>
        {health ? (
          <span style={s.chip(colors.success, colors.successBg)}>
            {health.status} — database {health.database}
          </span>
        ) : (
          <span style={s.chip(colors.ink500, colors.ink100)}>Checking… (or preview mode)</span>
        )}
      </div>
    </div>
  );
}
