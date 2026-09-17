import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import { colors, STATUS_META, CHART_PALETTE } from '../../styles/tokens.js';

const defaultColorFor = (status, idx) =>
  STATUS_META[status]?.color ?? CHART_PALETTE.series[idx % CHART_PALETTE.series.length];

// data: [{ status, count }]
export default function StatusBarChart({ data, height = 200, colorFor = defaultColorFor }) {
  if (data.length === 0) {
    return <div style={{ fontSize: 13, color: colors.ink500, padding: '32px 0', textAlign: 'center' }}>No data yet.</div>;
  }
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke={CHART_PALETTE.grid} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: colors.ink400 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="status" width={96} tick={{ fontSize: 12, fill: colors.ink700 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: colors.ink100 }}
            contentStyle={{ background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 10, fontSize: 12, color: colors.ink900 }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            {data.map((d, idx) => <Cell key={d.status} fill={colorFor(d.status, idx)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
