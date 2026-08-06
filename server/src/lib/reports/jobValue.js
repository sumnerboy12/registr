import db from '../../db/index.js';

const JOB_TYPE_LABELS = { contract: 'Contract', minor_works: 'Minor Works', remedial: 'Remedial' };
const JOB_STATUS_LABELS = {
  tendering: 'Tendering',
  awarded: 'Awarded',
  active: 'In Progress',
  practical_completion: 'Practical Completion',
  awaiting_retentions: 'Awaiting Retentions',
  closed: 'Completed',
  on_hold: 'On Hold',
  lost: 'Lost',
};

export function jobTypeLabel(type) {
  return JOB_TYPE_LABELS[type] ?? type;
}

export function jobStatusLabel(status) {
  return JOB_STATUS_LABELS[status] ?? status;
}

// One row per job_type/status combination actually present, not a dense
// grid — shared by routes/reports.js's GET /job-value (which fills in
// zeroes for missing combinations client-side, see JobValueReportPage.tsx)
// and the scheduled "Job Value" report type (see ./index.js), which
// doesn't. Ignores the start/end range the generic scheduled-report system
// passes every buildRows — this is a current-state snapshot, not a
// period-bound report, so there's nothing to filter by.
export function buildJobValueRows() {
  return db
    .prepare(
      `SELECT job_type, status, COUNT(*) AS count, COALESCE(SUM(value), 0) AS total_value
       FROM jobs
       GROUP BY job_type, status
       ORDER BY job_type, status`
    )
    .all();
}
