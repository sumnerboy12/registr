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
}

export type ProjectType = 'contract' | 'minor_works';
export type ProjectStatus = 'tendering' | 'awarded' | 'active' | 'on_hold' | 'practical_completion' | 'closed';
export type AssignmentRole = 'project_manager' | 'foreman' | 'estimator' | 'qs';

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  contract: 'Contract',
  minor_works: 'Minor Works',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  tendering: 'Tendering',
  awarded: 'Awarded',
  active: 'Active',
  on_hold: 'On Hold',
  practical_completion: 'Practical Completion',
  closed: 'Closed',
};

export const ASSIGNMENT_ROLE_LABELS: Record<AssignmentRole, string> = {
  project_manager: 'Project Manager',
  foreman: 'Foreman',
  estimator: 'Estimator',
  qs: 'QS',
};

export interface ProjectAssignment {
  id: number;
  role: AssignmentRole;
  person: { id: number; name: string; email: string | null };
}

export interface Project {
  id: string;
  code: string;
  name: string;
  client_id: number | null;
  project_type: ProjectType;
  status: ProjectStatus;
  site_address: string | null;
  contract_value: number | null;
  start_date: string | null;
  end_date: string | null;
  assignments?: ProjectAssignment[];
}
