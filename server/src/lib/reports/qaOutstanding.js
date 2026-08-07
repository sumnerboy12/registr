import db from '../../db/index.js';
import { CHECKLIST_ITEM_COMPLETE_STATUSES } from '../checklistStatuses.js';

// Every job with at least one checklist item that isn't Done or Won't Do
// yet, for the QA Check report (routes/reports.js) — lets whoever's on a
// job, or a QA reviewer, see what's left rather than opening each job
// individually. Optionally narrowed to one job status, one job type, and/or
// just the jobs a given person is assigned to (any role — PM, site
// supervisor, estimator, or QS — same breadth as the Jobs page's own "My
// Jobs" filter, see routes/jobs.js).
export function buildQaOutstandingRows({ status, jobType, mine, personId } = {}) {
  const completePlaceholders = CHECKLIST_ITEM_COMPLETE_STATUSES.map(() => '?').join(', ');
  const clauses = [`jci.status NOT IN (${completePlaceholders})`];
  const params = [...CHECKLIST_ITEM_COMPLETE_STATUSES];

  if (status) {
    clauses.push('jobs.status = ?');
    params.push(status);
  }
  if (jobType) {
    clauses.push('jobs.job_type = ?');
    params.push(jobType);
  }
  // mine is a separate flag from personId (rather than inferring "filter
  // requested" from personId being non-null) because the break-glass admin
  // login has no person_id at all — personId is legitimately null there,
  // and that still has to filter down to nothing, not turn into "no
  // assignment filter" the way `personId != null` would.
  if (mine) {
    clauses.push('EXISTS (SELECT 1 FROM job_assignments ja WHERE ja.job_id = jobs.id AND ja.person_id = ?)');
    params.push(personId);
  }

  // DISTINCT collapses the join back down to one row per job — every
  // selected column here is job-level, so a job with several outstanding
  // items would otherwise appear once per matching item.
  const jobs = db
    .prepare(
      `SELECT DISTINCT jobs.id, jobs.code, jobs.name, jobs.job_type, jobs.status,
         COALESCE(clients.name, jobs.client_name) AS client_name,
         (SELECT p.name FROM job_assignments ja JOIN people p ON p.id = ja.person_id
          WHERE ja.job_id = jobs.id AND ja.role = 'project_manager' LIMIT 1) AS pm_name
       FROM jobs
       JOIN job_checklist_items jci ON jci.job_id = jobs.id
       LEFT JOIN clients ON clients.id = jobs.client_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY jobs.code COLLATE NOCASE`
    )
    .all(...params);

  const itemsStmt = db.prepare(
    `SELECT stage, label, status FROM job_checklist_items
     WHERE job_id = ? AND status NOT IN (${completePlaceholders})
     ORDER BY stage, sequence, id`
  );

  return jobs.map((j) => ({
    ...j,
    items: itemsStmt.all(j.id, ...CHECKLIST_ITEM_COMPLETE_STATUSES),
  }));
}
