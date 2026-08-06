import { buildJobValueRows, jobTypeLabel, jobStatusLabel } from './jobValue.js';

// Plug-in registry for the scheduled-report system (see
// ../scheduledReportsScheduler.js) — adding a report type is purely
// additive here, no scheduler/route/schema changes needed.
//
// Each entry: { label, buildRows(start, end), headers, toRow(row) }
// — buildRows returns whatever row shape makes sense for that report,
// toRow flattens one such row into the string cells headers describes.
export const REPORT_TYPES = {
  job_value: {
    label: 'Job Value',
    // start/end (the scheduled report's period) are unused — this is a
    // current-state snapshot across every job, not a period-bound report.
    buildRows: () => buildJobValueRows(),
    headers: ['Job Type', 'Status', 'Count', 'Total Value'],
    toRow: (r) => [jobTypeLabel(r.job_type), jobStatusLabel(r.status), String(r.count), `$${r.total_value.toLocaleString('en-US')}`],
  },
};
