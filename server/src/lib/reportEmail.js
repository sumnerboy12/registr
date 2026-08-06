// Date range + table-rendering plumbing for the scheduled reports feature
// (see lib/scheduledReportsScheduler.js) — ported from rostr's
// lib/emailDates.js, trimmed to just what a scheduled report needs (no
// bookings-specific day-by-day row building).

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Parsed as local calendar values so '2026-07-20' always reads as the 20th
// regardless of server timezone.
export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDate(iso) {
  const date = parseISODate(iso);
  return `${WEEKDAY[date.getDay()]} ${date.getDate()} ${MONTH[date.getMonth()]}`;
}

// Monday of the calendar week containing `date`.
export function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function thisWeekRange() {
  const monday = startOfWeek(new Date());
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return { start: toISODate(monday), end: toISODate(sunday) };
}

export function nextWeekRange() {
  const nextMonday = startOfWeek(new Date());
  nextMonday.setDate(nextMonday.getDate() + 7);
  const sunday = new Date(nextMonday);
  sunday.setDate(sunday.getDate() + 6);
  return { start: toISODate(nextMonday), end: toISODate(sunday) };
}

export function nextTwoWeeksRange() {
  const nextMonday = startOfWeek(new Date());
  nextMonday.setDate(nextMonday.getDate() + 7);
  const end = new Date(nextMonday);
  end.setDate(end.getDate() + 13);
  return { start: toISODate(nextMonday), end: toISODate(end) };
}

// Resolves a scheduled_reports.period value to an actual date range at fire time.
export function periodRange(period) {
  if (period === 'this_week') return thisWeekRange();
  if (period === 'next_two_weeks') return nextTwoWeeksRange();
  return nextWeekRange();
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Fixed-width plain-text table, kept as the multipart/alternative text
// version for clients that can't render HTML.
export function renderDayTableText(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const formatRow = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  const headerSeparator = widths.map((w) => '-'.repeat(w)).join('  ');
  return [formatRow(headers), headerSeparator, ...rows.map(formatRow)].join('\n');
}

// Real HTML <table> — unlike the plain-text version, doesn't depend on the
// recipient's client using a monospace font.
export function renderDayTableHtml(headers, rows) {
  const cell = (text) => `<td style="padding:4px 12px 4px 0;border-bottom:1px solid #e2e2e2;">${escapeHtml(text)}</td>`;
  const headerCell = (text) => `<th style="padding:4px 12px 4px 0;border-bottom:2px solid #333;text-align:left;">${escapeHtml(text)}</th>`;
  const body = rows.map((row) => `<tr>${row.map(cell).join('')}</tr>`).join('');
  return (
    `<table style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:14px;margin:0;">` +
    `<thead><tr>${headers.map(headerCell).join('')}</tr></thead>` +
    `<tbody>${body}</tbody></table>`
  );
}

// Wraps each block placeholder's rendered <table> in its own outer-table
// row rather than inline in text — Outlook's Word engine adds unwanted
// paragraph spacing around a <table> found inline, which no CSS can
// suppress, but never triggers once it's the sole content of its own <td>.
export function wrapEmailHtmlBody(interpolatedHtml) {
  const parts = interpolatedHtml.split(/(<table[\s\S]*?<\/table>)/).filter((part) => part.length > 0);
  const rows = parts
    .map((part) => {
      const content = part.startsWith('<table') ? part : part.replace(/\n/g, '<br>');
      return `<tr><td style="padding:0;">${content}</td></tr>`;
    })
    .join('');
  return `<table role="presentation" style="border-collapse:collapse;width:100%;"><tbody>${rows}</tbody></table>`;
}
