// SQLite's datetime('now') (see server/src/db/schema.sql) returns
// "YYYY-MM-DD HH:MM:SS" in UTC with no timezone marker. Rendered as-is,
// that reads as the visitor's local time even though it isn't — appending
// "Z" (after swapping in the "T" ISO 8601 needs) makes the browser parse it
// as UTC, then toLocaleString() converts it to the viewer's local time.
export function formatDateTime(utc: string): string {
  return new Date(`${utc.replace(' ', 'T')}Z`).toLocaleString();
}
