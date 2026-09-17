// Minimal stroke icons, currentColor throughout so they inherit whatever
// accent colour the caller sets. Kept deliberately small and few — icons
// here encode what a stat means, not decoration for its own sake.

const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function TargetIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <circle cx="10" cy="10" r="7.5" />
      <circle cx="10" cy="10" r="4.25" />
      <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function AlertIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M10 3.2 17.3 16H2.7L10 3.2Z" />
      <path d="M10 8v3.4" />
      <circle cx="10" cy="14" r="0.15" fill="currentColor" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function TrophyIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M6 3.5h8v4a4 4 0 0 1-8 0v-4Z" />
      <path d="M6 4.5H3.5a2 2 0 0 0 2 3" />
      <path d="M14 4.5h2.5a2 2 0 0 1-2 3" />
      <path d="M10 11.5v3" />
      <path d="M7 16.5h6" />
      <path d="M8.3 14.5h3.4l.6 2h-4.6l.6-2Z" />
    </svg>
  );
}

export function UsersIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <circle cx="7.5" cy="7" r="2.6" />
      <path d="M2.7 16c.5-2.6 2.5-4.2 4.8-4.2s4.3 1.6 4.8 4.2" />
      <circle cx="14" cy="7.8" r="2.1" />
      <path d="M13.2 11.9c1.9.2 3.4 1.7 3.8 3.9" />
    </svg>
  );
}

export function CheckCircleIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M6.8 10.2 9 12.4l4.2-4.8" />
    </svg>
  );
}
