import { REPORT_TYPES } from './reports/index.js';
import { listRawSchedules, listActiveRecipients, setLastSentDate } from './scheduledReports.js';
import { sendMail, isMailConfigured } from './mailer.js';
import { formatDate, periodRange, renderDayTableText, renderDayTableHtml, wrapEmailHtmlBody, toISODate } from './reportEmail.js';

const CHECK_INTERVAL_MS = 60_000;

function buildReportEmail(reportType, rows, start, end) {
  const subject = `Registr report: ${reportType.label} (${formatDate(start)} – ${formatDate(end)})`;
  const intro = `${reportType.label} for ${formatDate(start)} – ${formatDate(end)}:`;

  // Sent even when there's nothing to report — silence would read as the
  // schedule being broken, and for a "problem" report a clean result is
  // itself useful information. Padded to the report's own column count so
  // this works for any report type regardless of header count.
  const tableRows =
    rows.length > 0
      ? rows.map(reportType.toRow)
      : [['Nothing to report — all clear', ...Array(reportType.headers.length - 1).fill('')]];

  const text = `${intro}\n\n${renderDayTableText(reportType.headers, tableRows)}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">${intro}<br><br>${wrapEmailHtmlBody(
    renderDayTableHtml(reportType.headers, tableRows)
  )}</div>`;

  return { subject, text, html };
}

// Exported for the "send now" test-send route — skips the idempotency
// check and does not touch last_sent_date, so it can't interfere with the
// schedule's real next fire.
export async function fireSchedule(schedule) {
  const reportType = REPORT_TYPES[schedule.report_type];
  if (!reportType) return;

  const { start, end } = periodRange(schedule.period);
  const rows = reportType.buildRows(start, end);
  const recipients = listActiveRecipients(schedule.id);
  const { subject, text, html } = buildReportEmail(reportType, rows, start, end);

  for (const person of recipients) {
    try {
      await sendMail({ to: person.email, subject, text, html });
    } catch (e) {
      console.error(`[scheduled report ${schedule.id}] failed to email ${person.name}:`, e.message);
    }
  }
  console.log(`[scheduled report ${schedule.id}] sent "${reportType.label}" to ${recipients.length} recipient(s) for ${start} – ${end}`);
}

// True once a day, the first tick at/after the configured time on the
// configured day — day_of_week is fixed per schedule, so "already sent
// today" is enough to guarantee it won't fire again until next week's
// matching day. If the server is down for the schedule's *entire* matching
// day, it's simply missed.
function shouldFireNow(schedule, now, todayIso) {
  if (!schedule.enabled) return false;
  if (schedule.last_sent_date === todayIso) return false;

  const [hour, minute] = schedule.time.split(':').map(Number);
  const scheduledMinutes = hour * 60 + minute;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return now.getDay() === schedule.day_of_week && nowMinutes >= scheduledMinutes;
}

function tick() {
  if (!isMailConfigured()) return;
  const now = new Date();
  const todayIso = toISODate(now);

  for (const schedule of listRawSchedules()) {
    if (!shouldFireNow(schedule, now, todayIso)) continue;
    // Marked sent synchronously before the async send starts, so an
    // overlapping tick or a slow send can't trigger a second send for the
    // same day.
    setLastSentDate(schedule.id, todayIso);
    fireSchedule(schedule).catch((e) => console.error(`[scheduled report ${schedule.id}] run failed:`, e));
  }
}

export function startScheduledReportsScheduler() {
  setInterval(tick, CHECK_INTERVAL_MS);
}
