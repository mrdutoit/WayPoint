import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { colors, STATUS_META, CHART_PALETTE } from '../../styles/tokens.js';

const defaultColorFor = (status, idx) =>
  STATUS_META[status]?.color ?? CHART_PALETTE.series[idx % CHART_PALETTE.series.length];

/**
 * data: [{ status, count }]. colorFor(status, idx) overrides the default
 * STATUS_META lookup — used where the categories aren't rubric statuses
 * (e.g. "Checked in" / "Missing" on the check-in compliance donut).
 */
export default function StatusDonut({ data, height = 200, centerLabel, colorFor = defaultColorFor }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return <div style={{ fontSize: 13, color: colors.ink500, padding: '32px 0', textAlign: 'center' }}>No data yet.</div>;
  }

  return (
    <div>
      <div style={{ position: 'relative', width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data} dataKey="count" nameKey="status"
              innerRadius="64%" outerRadius="92%" paddingAngle={2} strokeWidth={0}
              isAnimationActive={false}
            >
              {data.map((d, idx) => <Cell key={d.status} fill={colorFor(d.status, idx)} />)}
            </Pie>
            <Tooltip
              contentStyle={{ background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 10, fontSize: 12, color: colors.ink900 }}
              formatter={(value, name) => [`${value} (${Math.round((value / total) * 100)}%)`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: colors.ink900 }}>{total}</div>
          {centerLabel && <div style={{ fontSize: 11, color: colors.ink500 }}>{centerLabel}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', justifyContent: 'center', marginTop: 12 }}>
        {data.map((d, idx) => (
          <div key={d.status} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.ink700 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: colorFor(d.status, idx), display: 'inline-block' }} />
            {d.status} <span style={{ color: colors.ink400 }}>({d.count})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
