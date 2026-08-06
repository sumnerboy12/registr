// SQLite's datetime('now') (see server/src/db/schema.sql) returns
// "YYYY-MM-DD HH:MM:SS" in UTC with no timezone marker. Rendered as-is,
// that reads as the visitor's local time even though it isn't — appending
// "Z" (after swapping in the "T" ISO 8601 needs) makes the browser parse it
// as UTC, then toLocaleString() converts it to the viewer's local time.
export function formatDateTime(utc: string): string {
  return new Date(`${utc.replace(' ', 'T')}Z`).toLocaleString();
}

const MINUTE = 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const MONTH = DAY * 30;
const YEAR = DAY * 365;

// Coarse, rounded-down buckets (e.g. "29 days ago" rather than rolling over
// to "1 month ago" early) — good enough for a comment timeline, not meant
// to be to-the-second precise. Pair with formatDateTime in a tooltip for
// the exact value.
export function formatRelativeTime(utc: string): string {
  const then = new Date(`${utc.replace(' ', 'T')}Z`).getTime();
  const diffSeconds = Math.max(0, Math.floor((Date.now() - then) / 1000));

  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

  if (diffSeconds < 30) return 'just now';
  if (diffSeconds < HOUR) return plural(Math.floor(diffSeconds / MINUTE), 'minute');
  if (diffSeconds < DAY) return plural(Math.floor(diffSeconds / HOUR), 'hour');
  if (diffSeconds < MONTH) return plural(Math.floor(diffSeconds / DAY), 'day');
  if (diffSeconds < YEAR) return plural(Math.floor(diffSeconds / MONTH), 'month');
  return plural(Math.floor(diffSeconds / YEAR), 'year');
}
