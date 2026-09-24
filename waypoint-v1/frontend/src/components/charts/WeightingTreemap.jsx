import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { colors, STATUS_META, CHART_PALETTE } from '../../styles/tokens.js';

const defaultColorFor = (status, idx) =>
  STATUS_META[status]?.color ?? CHART_PALETTE.series[idx % CHART_PALETTE.series.length];

// A cell's fill colour is whatever the status happens to be (danger,
// warn, brand, success, or a neutral grey for "Not Started") — a fixed
// text colour would read poorly against some of those, so the label
// gets a dark outline via paintOrder rather than a flat colour, which
// stays legible regardless of the fill underneath it.
function TreemapCell({ x, y, width, height, name, status, index, depth, colorFor }) {
  // Recharts calls `content` for the ROOT node as well (depth 0, no
  // name, no status) — not just the leaves. The original version read
  // name.length unconditionally, threw on the root, and with no error
  // boundary anywhere that unmounted the whole app: the blank Scorecard
  // page (2026-09-24). Render leaves only.
  if (depth === 0 || !width || !height) return null;
  const fill = colorFor(status, index);
  name = name ?? '';
  const showLabel = width > 46 && height > 22;
  const maxChars = Math.max(0, Math.floor((width - 10) / 6.2));
  const label = name.length > maxChars ? `${name.slice(0, Math.max(0, maxChars - 1))}…` : name;

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{ fill, stroke: colors.panel, strokeWidth: 2 }} />
      {showLabel && (
        <text
          x={x + 6} y={y + 16} fontSize={11} fontWeight={600} fill="#fff"
          stroke="rgba(0,0,0,0.35)" strokeWidth={2.5} paintOrder="stroke"
          style={{ pointerEvents: 'none' }}
        >
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * data: [{ name, size, status }] — one entry per Key Result, size is
 * its weighting (FR-016), status drives the cell colour. colorFor
 * override follows the same convention as StatusDonut/StatusBarChart.
 */
export default function WeightingTreemap({ data, height = 260, colorFor = defaultColorFor }) {
  if (!data || data.length === 0) {
    return <div style={{ fontSize: 13, color: colors.ink500, padding: '32px 0', textAlign: 'center' }}>No data yet.</div>;
  }

  const statuses = [...new Set(data.map((d) => d.status))];

  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data} dataKey="size" nameKey="name" stroke={colors.panel}
            isAnimationActive={false}
            content={<TreemapCell colorFor={colorFor} />}
          >
            <Tooltip
              contentStyle={{ background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 10, fontSize: 12, color: colors.ink900 }}
              formatter={(value, _name, item) => [`weighting ${value}`, item?.payload?.name ?? item?.payload?.root?.name ?? '']}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', justifyContent: 'center', marginTop: 12 }}>
        {statuses.map((status, idx) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.ink700 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: colorFor(status, idx), display: 'inline-block' }} />
            {status}
          </div>
        ))}
      </div>
    </div>
  );
}
