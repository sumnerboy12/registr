import db from '../db/index.js';
import { REPORT_TYPES } from './reports/index.js';

function attachRecipients(schedule) {
  const recipients = db
    .prepare(
      `SELECT people.id, people.name, people.email, people.role FROM scheduled_report_recipients
       JOIN people ON people.id = scheduled_report_recipients.person_id
       WHERE scheduled_report_recipients.scheduled_report_id = ?
       ORDER BY people.name COLLATE NOCASE`
    )
    .all(schedule.id);
  return {
    id: schedule.id,
    report_type: schedule.report_type,
    label: REPORT_TYPES[schedule.report_type]?.label ?? schedule.report_type,
    enabled: !!schedule.enabled,
    day_of_week: schedule.day_of_week,
    time: schedule.time,
    period: schedule.period,
    last_sent_date: schedule.last_sent_date,
    recipients,
  };
}

export function listSchedules() {
  const rows = db.prepare('SELECT * FROM scheduled_reports ORDER BY id').all();
  return rows.map(attachRecipients);
}

// Raw row (no recipients join) — used by the scheduler, which only needs
// the schedule's own fields plus a separate recipient lookup at fire time.
export function getRawSchedule(id) {
  return db.prepare('SELECT * FROM scheduled_reports WHERE id = ?').get(id);
}

export function getSchedule(id) {
  const row = getRawSchedule(id);
  return row ? attachRecipients(row) : null;
}

export function listRawSchedules() {
  return db.prepare('SELECT * FROM scheduled_reports').all();
}

function validate({ report_type, day_of_week, time, period, recipient_person_ids }) {
  if (!REPORT_TYPES[report_type]) return `Unknown report_type "${report_type}"`;
  if (!Number.isInteger(day_of_week) || day_of_week < 0 || day_of_week > 6) {
    return 'day_of_week must be an integer 0–6';
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return 'time must be HH:MM';
  if (!['this_week', 'next_week', 'next_two_weeks'].includes(period)) return 'Invalid period';
  if (!Array.isArray(recipient_person_ids)) return 'recipient_person_ids is required';
  if (recipient_person_ids.length > 0) {
    const placeholders = recipient_person_ids.map(() => '?').join(',');
    const validIds = new Set(
      db
        .prepare(`SELECT id FROM people WHERE id IN (${placeholders})`)
        .all(...recipient_person_ids)
        .map((r) => r.id)
    );
    const missing = recipient_person_ids.filter((id) => !validIds.has(id));
    if (missing.length > 0) return `Unknown recipient id(s): ${missing.join(', ')}`;
  }
  return null;
}

function setRecipients(scheduleId, recipientIds) {
  db.prepare('DELETE FROM scheduled_report_recipients WHERE scheduled_report_id = ?').run(scheduleId);
  const insert = db.prepare('INSERT INTO scheduled_report_recipients (scheduled_report_id, person_id) VALUES (?, ?)');
  for (const id of recipientIds) insert.run(scheduleId, id);
}

export function createSchedule(input) {
  const error = validate(input);
  if (error) throw Object.assign(new Error(error), { status: 400 });

  const { report_type, day_of_week, time, period, enabled, recipient_person_ids } = input;
  const result = db
    .prepare(`INSERT INTO scheduled_reports (report_type, enabled, day_of_week, time, period) VALUES (?, ?, ?, ?, ?)`)
    .run(report_type, enabled === false ? 0 : 1, day_of_week, time, period);

  setRecipients(result.lastInsertRowid, recipient_person_ids);
  return getSchedule(result.lastInsertRowid);
}

export function updateSchedule(id, input) {
  const existing = getRawSchedule(id);
  if (!existing) return null;

  const merged = {
    report_type: input.report_type ?? existing.report_type,
    day_of_week: input.day_of_week ?? existing.day_of_week,
    time: input.time ?? existing.time,
    period: input.period ?? existing.period,
    recipient_person_ids: input.recipient_person_ids,
  };
  const error = validate(merged);
  if (error) throw Object.assign(new Error(error), { status: 400 });

  const enabled = input.enabled != null ? (input.enabled ? 1 : 0) : existing.enabled;
  db.prepare(
    `UPDATE scheduled_reports SET report_type = ?, enabled = ?, day_of_week = ?, time = ?, period = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(merged.report_type, enabled, merged.day_of_week, merged.time, merged.period, id);

  setRecipients(id, merged.recipient_person_ids);
  return getSchedule(id);
}

export function deleteSchedule(id) {
  db.prepare('DELETE FROM scheduled_reports WHERE id = ?').run(id);
}

export function setLastSentDate(id, dateIso) {
  db.prepare(`UPDATE scheduled_reports SET last_sent_date = ?, updated_at = datetime('now') WHERE id = ?`).run(dateIso, id);
}

// Recipients for firing — re-checked against people.active at fire time
// (not just at config time), so someone deactivated since the schedule was
// set up doesn't keep getting emailed. registr owns this data directly, so
// (unlike rostr's version of this function) there's no remote re-resolve.
export function listActiveRecipients(scheduleId) {
  return db
    .prepare(
      `SELECT people.id, people.name, people.email FROM scheduled_report_recipients
       JOIN people ON people.id = scheduled_report_recipients.person_id
       WHERE scheduled_report_recipients.scheduled_report_id = ? AND people.active = 1
         AND people.email IS NOT NULL AND people.email != ''`
    )
    .all(scheduleId);
}
