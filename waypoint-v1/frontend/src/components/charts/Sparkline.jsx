import { colors } from '../../styles/tokens.js';

// A tiny inline trend line — no axes, no legend, just shape and a dot on
// the most recent value. Deliberately not a full recharts chart: at this
// size (sits inline next to a title) the chrome a real chart needs would
// cost more than it shows.
export default function Sparkline({ values, width = 72, height = 24, accent = colors.brand600 }) {
  if (!values || values.length === 0) {
    return null;
  }
  if (values.length === 1) {
    return (
      <svg width={width} height={height} style={{ flexShrink: 0 }}>
        <circle cx={width / 2} cy={height / 2} r={2.5} fill={accent} />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padY = 3;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - padY - ((v - min) / range) * (height - padY * 2);
    return [x, y];
  });
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg width={width} height={height} style={{ flexShrink: 0 }}>
      <path d={path} fill="none" stroke={accent} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2.5} fill={accent} />
    </svg>
  );
}
