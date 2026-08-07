// Shared between routes/checklistTemplates.js and routes/jobs.js's
// checklist endpoints, so the two never drift apart on what a valid stage
// is.
export const CHECKLIST_STAGES = ['pre_start', 'in_progress', 'completion', 'warranty'];
