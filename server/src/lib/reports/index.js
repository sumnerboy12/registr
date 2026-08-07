// Plug-in registry for the scheduled-report system (see
// ../scheduledReportsScheduler.js) — adding a report type is purely
// additive here, no scheduler/route/schema changes needed.
//
// Each entry: { label, buildRows(start, end), headers, toRow(row) }
// — buildRows returns whatever row shape makes sense for that report,
// toRow flattens one such row into the string cells headers describes.
//
// Job Value was removed from here (still available as its own interactive
// report — see routes/reports.js's GET /job-value and
// JobValueReportPage.tsx, which don't go through this registry at all) —
// currently empty until another report type is added.
export const REPORT_TYPES = {};
