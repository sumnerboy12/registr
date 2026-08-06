import db from '../db/index.js';
import { isMailConfigured, sendMail } from './mailer.js';

// Local date components, not toISOString() — that's UTC, which silently
// rolls the date back a day in positive-UTC-offset zones like NZ for a good
// chunk of the local day.
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Every registr admin with an email on file — the notification recipients.
// Not "everyone active", specifically admins, since this is an account/HR
// event someone needs to actually act on.
function adminEmails() {
  return db
    .prepare(
      `SELECT DISTINCT people.email FROM people
       JOIN person_app_access ON person_app_access.person_id = people.id
       WHERE person_app_access.app = 'registr' AND person_app_access.role = 'admin' AND people.email IS NOT NULL`
    )
    .all()
    .map((r) => r.email);
}

// Finds still-active people whose employment_end_date (their last
// employed day) has passed, marks them inactive, and emails registr's
// admins a summary — so a departed employee doesn't linger as "active"
// (visible in pickers, still able to sign in via SSO) just because nobody
// remembered to flip the switch by hand. Run daily (see
// startEmploymentCheckScheduler below) and exposed as a manual endpoint
// (POST /v1/people/check-employment) for on-demand/testing use.
export async function deactivateExpiredEmployment() {
  const today = todayISO();
  const expired = db
    .prepare(
      `SELECT id, name, email, employment_end_date FROM people
       WHERE active = 1 AND employment_end_date IS NOT NULL AND employment_end_date < ?
       ORDER BY employment_end_date`
    )
    .all(today);

  if (expired.length === 0) return { deactivated: [] };

  const deactivateStmt = db.prepare(`UPDATE people SET active = 0, updated_at = datetime('now') WHERE id = ?`);
  for (const p of expired) deactivateStmt.run(p.id);

  if (isMailConfigured()) {
    const to = adminEmails();
    if (to.length > 0) {
      const subject = `Registr: ${expired.length} ${expired.length === 1 ? 'person' : 'people'} auto-deactivated (employment ended)`;
      const text =
        `The following people have been automatically marked inactive in Registr because their employment end date has passed:\n\n` +
        expired.map((p) => `- ${p.name} (ended ${p.employment_end_date})`).join('\n') +
        `\n\nReview their People record if this wasn't expected.`;
      const html =
        `<p>The following people have been automatically marked inactive in Registr because their employment end date has passed:</p>` +
        `<ul>${expired.map((p) => `<li>${escapeHtml(p.name)} (ended ${p.employment_end_date})</li>`).join('')}</ul>` +
        `<p>Review their People record if this wasn't expected.</p>`;
      try {
        await sendMail({ to: to.join(','), subject, text, html });
      } catch (e) {
        console.error('[employment check] failed to send notification email:', e.message);
      }
    }
  }

  return { deactivated: expired };
}

const RUN_HOUR = 3;

function msUntilNextRun() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), RUN_HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

// Recomputes the delay to the next 3am on every run (rather than a fixed
// setInterval), so a daylight-saving shift doesn't leave it running an hour
// early/late until the next restart.
export function startEmploymentCheckScheduler() {
  const run = () => {
    deactivateExpiredEmployment()
      .then((result) => {
        if (result.deactivated.length) {
          console.log(`[employment check] deactivated ${result.deactivated.length}: ${result.deactivated.map((p) => p.name).join(', ')}`);
        }
      })
      .catch((e) => console.error('[employment check] failed:', e.message));
  };

  const scheduleNext = () => {
    setTimeout(() => {
      run();
      scheduleNext();
    }, msUntilNextRun());
  };
  scheduleNext();
}
