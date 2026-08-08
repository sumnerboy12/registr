export type AppName = 'registr' | 'rostr' | 'claimr' | 'costr';
export type Role = 'admin' | 'editor' | 'readonly';

export interface AppAccess {
  app: AppName;
  role: Role;
}

export const APP_LABELS: Record<AppName, string> = {
  registr: 'Registr',
  rostr: 'Rostr',
  claimr: 'Claimr',
  costr: 'Costr',
};

// A person either signs in via SSO or doesn't sign in at all — the only
// other way into registr is the single hardcoded break-glass admin login,
// which isn't a person record.
export type LoginType = 'sso' | 'none';

export const LOGIN_TYPE_LABELS: Record<LoginType, string> = {
  sso: 'SSO',
  none: 'None',
};

// Employment classification — registr is just the master list of WRS
// employees; whether someone shows up in rostr's job scheduling is rostr's
// own local flag, not this.
export type EmploymentType = 'wage' | 'temp' | 'salary';

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  wage: 'Wage',
  temp: 'Temp',
  salary: 'Salary',
};

export interface Person {
  id: number;
  name: string;
  login_type: LoginType;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  employment_start_date: string | null;
  employment_end_date: string | null;
  role: string | null;
  employment_type: EmploymentType;
  active: boolean;
  color: string;
  notes: string | null;
  // Whether ThinkSafe (Wayman's H&S system) has a user matching this
  // person's name — see server/src/lib/thinksafeSync.js. Always false if
  // THINKSAFE_API_URL/THINKSAFE_API_KEY aren't set on the server.
  thinksafe_user: boolean;
  app_access: AppAccess[];
}

export interface AuthPerson {
  id: number;
  name: string;
  email: string | null;
  role: Role;
}

export interface AuthStatus {
  oidcEnabled: boolean;
  adminLoginEnabled: boolean;
}

export type ConsumingApp = 'rostr' | 'claimr' | 'costr';

export interface ApiKey {
  id: number;
  app: ConsumingApp;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
}

export type ClientType = 'main_contractor' | 'direct' | 'residential';

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  main_contractor: 'Main Contractor',
  direct: 'Direct',
  residential: 'Residential',
};

export interface Client {
  id: number;
  name: string;
  type: ClientType;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  accounts_email: string | null;
  active: boolean;
  color: string;
  notes: string | null;
  // How many jobs currently link to this client — deletion is blocked
  // server-side (see routes/clients.js) whenever this is above 0.
  job_count: number;
}

// WRS-owned equipment only — hired-in gear is a rostr-only concept, not
// tracked here.
export interface Plant {
  id: number;
  name: string;
  rego: string | null;
  active: boolean;
  color: string;
  notes: string | null;
}

export type JobType = 'contract' | 'minor_works' | 'remedial';
export type JobStatus =
  | 'tendering'
  | 'awarded'
  | 'active'
  | 'practical_completion'
  | 'awaiting_retentions'
  | 'closed'
  | 'on_hold'
  | 'lost';
export type AssignmentRole = 'project_manager' | 'site_supervisor' | 'estimator' | 'qs';

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  contract: 'Contract',
  minor_works: 'Minor Works',
  remedial: 'Remedial',
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  tendering: 'Tendering',
  awarded: 'Awarded',
  active: 'In Progress',
  practical_completion: 'Practical Completion',
  awaiting_retentions: 'Awaiting Retentions',
  closed: 'Completed',
  on_hold: 'On Hold',
  lost: 'Lost',
};

// Retentions-scheme statuses — only meaningful on Contract jobs. Mirrored
// server-side in routes/jobs.js's CONTRACT_ONLY_STATUSES.
export const CONTRACT_ONLY_STATUSES: JobStatus[] = ['practical_completion', 'awaiting_retentions'];

export const ASSIGNMENT_ROLE_LABELS: Record<AssignmentRole, string> = {
  project_manager: 'Project Manager',
  site_supervisor: 'Site Supervisor',
  estimator: 'Estimator',
  qs: 'QS',
};

export interface JobAssignment {
  id: number;
  role: AssignmentRole;
  person: { id: number; name: string; email: string | null };
}

export interface JobComment {
  id: number;
  author_person_id: number | null;
  author_name: string;
  body: string;
  created_at: string;
}

export interface JobAttachment {
  id: number;
  original_name: string;
  content_type: string;
  size: number;
  uploaded_by_name: string;
  created_at: string;
}

export interface Job {
  id: string;
  code: string;
  name: string;
  client_id: number | null;
  // Free-text fallback when no client_id is picked from the list — cleared
  // once a real client is linked (see routes/jobs.js).
  client_name: string | null;
  // This job's own contact — applies regardless of client_id/client_name,
  // independent of the linked Client's own contact fields.
  contact_name: string | null;
  contact_email: string | null;
  job_type: JobType;
  status: JobStatus;
  site_address: string | null;
  value: number | null;
  notes: string | null;
  // Whether ThinkSafe (Wayman's H&S system) has a site configured for this
  // job's code — see server/src/lib/thinksafeSync.js. Always false if
  // THINKSAFE_API_URL/THINKSAFE_API_KEY aren't set on the server.
  thinksafe_site: boolean;
  // Canonical per-type tint colour, computed server-side (see
  // JOB_TYPE_COLORS in server/src/lib/jobTypes.js) so registr and every
  // downstream app (rostr) tint a job's row identically instead of each
  // maintaining its own copy of the colour choice.
  job_type_color: string;
  assignments?: JobAssignment[];
}

// One row per job_type/status combination that has at least one job — see
// server/src/routes/reports.js. The client fills in zero for any
// combination missing here (see JobValueReportPage.tsx).
export interface JobValueSummaryRow {
  job_type: JobType;
  status: JobStatus;
  count: number;
  total_value: number;
}

export type ReportPeriod = 'this_week' | 'next_week' | 'next_two_weeks';

// Empty registry for now (see server/src/lib/reports/index.js) — ported as
// infrastructure ahead of any actual registr report types.
export interface ReportTypeOption {
  key: string;
  label: string;
}

export interface ScheduledReportRecipient {
  id: number;
  name: string;
  email: string | null;
  role: string | null;
}

export interface ScheduledReport {
  id: number;
  report_type: string;
  label: string;
  enabled: boolean;
  day_of_week: number;
  time: string;
  period: ReportPeriod;
  last_sent_date: string | null;
  recipients: ScheduledReportRecipient[];
}

// A job's QA checklist, from creation through to completion and warranty
// docs — see server/src/lib/checklistStages.js.
export type ChecklistStage = 'pre_start' | 'in_progress' | 'completion' | 'warranty';

export const CHECKLIST_STAGES: ChecklistStage[] = ['pre_start', 'in_progress', 'completion', 'warranty'];

export const CHECKLIST_STAGE_LABELS: Record<ChecklistStage, string> = {
  pre_start: 'Pre-Start',
  in_progress: 'In Progress',
  completion: 'Completion',
  warranty: 'Warranty',
};

// Admin-maintained master list (see ChecklistTemplatesPage.tsx) — copied
// onto each job's own checklist rather than referenced live, see
// JobChecklistItem below. job_type scopes an item to one job type; null
// applies to every job type.
export interface ChecklistTemplateItem {
  id: number;
  stage: ChecklistStage;
  job_type: JobType | null;
  label: string;
  sequence: number;
  active: boolean;
  // Copied onto each job item at creation/sync time — see JobChecklistItem
  // below for what it means there.
  internal: boolean;
  created_at: string;
  updated_at: string;
}

export type ChecklistItemStatus = 'open' | 'in_progress' | 'done' | 'not_done';

export const CHECKLIST_ITEM_STATUSES: ChecklistItemStatus[] = ['open', 'in_progress', 'done', 'not_done'];

export const CHECKLIST_ITEM_STATUS_LABELS: Record<ChecklistItemStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
  not_done: "Won't Do",
};

// Statuses that count as the item being finished — Won't Do is a deliberate
// resolution (the task doesn't apply / was decided against) same as Done,
// not an outstanding item. Used anywhere "is this item complete?" matters:
// progress counts, stage auto-collapse, the QA outstanding-items report.
export const CHECKLIST_ITEM_COMPLETE_STATUSES: ChecklistItemStatus[] = ['done', 'not_done'];

// Colors for the status badge/select — kept alongside the labels above
// rather than computed in the component so every place that renders a
// status (list row, modal) stays visually consistent.
export const CHECKLIST_ITEM_STATUS_COLORS: Record<ChecklistItemStatus, string> = {
  open: 'var(--text-dim)',
  in_progress: '#b8860b',
  done: '#2e7d32',
  not_done: 'var(--danger)',
};

export interface JobChecklistItem {
  id: number;
  template_id: number | null;
  stage: ChecklistStage;
  label: string;
  sequence: number;
  status: ChecklistItemStatus;
  status_by_person_id: number | null;
  status_by_name: string | null;
  status_at: string | null;
  notes: string | null;
  // Excluded from the customer-facing PDF export (JobQaReportPage.tsx) —
  // still shown everywhere else (the job's own Checklist card, the QA
  // Check report).
  internal: boolean;
  comment_count: number;
  attachment_count: number;
  created_at: string;
}

// A discussion thread on one checklist item — see JobComment for the
// job-level equivalent this mirrors.
export interface ChecklistItemComment {
  id: number;
  author_person_id: number | null;
  author_name: string;
  body: string;
  created_at: string;
}

// See JobAttachment for the job-level equivalent this mirrors.
export interface ChecklistItemAttachment {
  id: number;
  original_name: string;
  content_type: string;
  size: number;
  uploaded_by_name: string;
  created_at: string;
}

// One outstanding (not Done or Won't Do) checklist item, as returned by the
// QA Check report — see server/src/lib/reports/qaOutstanding.js.
export interface QaOutstandingItem {
  stage: ChecklistStage;
  label: string;
  status: ChecklistItemStatus;
}

// One job with at least one outstanding checklist item.
export interface QaOutstandingJob {
  id: string;
  code: string;
  name: string;
  job_type: JobType;
  status: JobStatus;
  client_name: string | null;
  client_color: string | null;
  pm_name: string | null;
  items: QaOutstandingItem[];
}
