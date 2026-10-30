const number = new Intl.NumberFormat('en-US');

export const fmt = (n) => (n === null || n === undefined ? '—' : number.format(n));
export const pct = (ratio, digits = 1) =>
  ratio === null || ratio === undefined ? '—' : `${(ratio * 100).toFixed(digits)} %`;
/** "2026-01-05T06:00:00+05:30" → "2026-01-05 06:00". All data is in one time zone (+05:30). */
export const when = (ts) => (ts ? `${ts.slice(0, 10)} ${ts.slice(11, 16)}` : '—');
export const hours = (minutes) =>
  minutes === null || minutes === undefined ? '—' : `${(minutes / 60).toFixed(2)} h`;
/** Compact axis ticks: 950, 1.2K, 12K. */
export const compact = (n) =>
  Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : String(n);
