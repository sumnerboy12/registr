import type { Job } from '../types';

// Reasons the WarningBadge next to a job's name should show a tooltip for —
// shared by JobsPage.tsx (board card, list row) and JobHeader.tsx so a new
// check only needs to be added here once. The SSSP check only fires when a
// ThinkSafe site actually exists (no site already covers that case) and
// only for Contract jobs — Minor Works/Remedial sites aren't required to
// carry one.
export function jobWarnings(job: Job): string[] {
  return [
    !job.thinksafe_site && 'No site configured in ThinkSafe',
    job.thinksafe_site && !job.thinksafe_sssp && job.job_type === 'contract' && 'No SSSP configured in ThinkSafe',
  ].filter((w): w is string => !!w);
}
