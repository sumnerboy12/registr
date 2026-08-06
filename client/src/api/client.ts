import type {
  ApiKey,
  AppAccess,
  AuthPerson,
  AuthStatus,
  Client,
  ConsumingApp,
  Person,
  Plant,
  Job,
  JobAssignment,
  JobAttachment,
  JobComment,
  JobStatus,
  JobType,
  JobValueSummaryRow,
} from '../types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed: ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Separate from request() — a FormData body needs the browser to set its
// own multipart Content-Type (with boundary), which request()'s hardcoded
// 'application/json' header would stomp on.
async function uploadFile<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`/api${path}`, { method: 'POST', body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed: ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  getHealth: () => request<{ ok: boolean; commit: string | null; env: string }>('/health'),

  getMe: () => request<AuthPerson>('/auth/me'),
  login: (password: string) =>
    request<AuthPerson>('/auth/admin-login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  getAuthStatus: () => request<AuthStatus>('/auth/status'),

  getClients: (params?: { active?: boolean; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.active) qs.set('active', '1');
    if (params?.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<Client[]>(`/v1/clients${suffix}`);
  },
  createClient: (data: Partial<Client>) => request<Client>('/v1/clients', { method: 'POST', body: JSON.stringify(data) }),
  updateClient: (id: number, data: Partial<Client>) =>
    request<Client>(`/v1/clients/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  getPlant: (params?: { active?: boolean; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.active) qs.set('active', '1');
    if (params?.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<Plant[]>(`/v1/plant${suffix}`);
  },
  createPlant: (data: Partial<Plant>) => request<Plant>('/v1/plant', { method: 'POST', body: JSON.stringify(data) }),
  updatePlant: (id: number, data: Partial<Plant>) =>
    request<Plant>(`/v1/plant/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  getPeople: (params?: { active?: boolean; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.active) qs.set('active', '1');
    if (params?.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<Person[]>(`/v1/people${suffix}`);
  },
  createPerson: (data: Partial<Person>) => request<Person>('/v1/people', { method: 'POST', body: JSON.stringify(data) }),
  updatePerson: (id: number, data: Partial<Person>) =>
    request<Person>(`/v1/people/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  grantAppAccess: (personId: number, data: Pick<AppAccess, 'app' | 'role'>) =>
    request<AppAccess[]>(`/v1/people/${personId}/app-access`, { method: 'POST', body: JSON.stringify(data) }),
  revokeAppAccess: (personId: number, app: string) =>
    request<void>(`/v1/people/${personId}/app-access/${app}`, { method: 'DELETE' }),

  getJobs: (params?: { status?: JobStatus; type?: JobType; client_id?: number; q?: string; archived?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.type) qs.set('type', params.type);
    if (params?.client_id) qs.set('client_id', String(params.client_id));
    if (params?.q) qs.set('q', params.q);
    if (params?.archived) qs.set('archived', '1');
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<Job[]>(`/v1/jobs${suffix}`);
  },
  getJob: (id: string) => request<Job>(`/v1/jobs/${id}?include=assignments`),
  getJobByCode: (code: string) => request<Job>(`/v1/jobs/by-code/${encodeURIComponent(code)}?include=assignments`),
  getNextJobCode: (jobType: JobType) => request<{ code: string }>(`/v1/jobs/next-code?job_type=${jobType}`),
  createJob: (data: Partial<Job>) => request<Job>('/v1/jobs', { method: 'POST', body: JSON.stringify(data) }),
  updateJob: (id: string, data: Partial<Job>) =>
    request<Job>(`/v1/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  addAssignment: (jobId: string, data: { person_id: number; role: string }) =>
    request<JobAssignment[]>(`/v1/jobs/${jobId}/assignments`, { method: 'POST', body: JSON.stringify(data) }),
  removeAssignment: (jobId: string, assignmentId: number) =>
    request<void>(`/v1/jobs/${jobId}/assignments/${assignmentId}`, { method: 'DELETE' }),
  getJobComments: (jobId: string) => request<JobComment[]>(`/v1/jobs/${jobId}/comments`),
  addJobComment: (jobId: string, body: string) =>
    request<JobComment>(`/v1/jobs/${jobId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
  updateJobComment: (jobId: string, commentId: number, body: string) =>
    request<JobComment>(`/v1/jobs/${jobId}/comments/${commentId}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
  deleteJobComment: (jobId: string, commentId: number) =>
    request<void>(`/v1/jobs/${jobId}/comments/${commentId}`, { method: 'DELETE' }),
  getJobAttachments: (jobId: string) => request<JobAttachment[]>(`/v1/jobs/${jobId}/attachments`),
  uploadJobAttachment: (jobId: string, file: File) => uploadFile<JobAttachment>(`/v1/jobs/${jobId}/attachments`, file),
  deleteJobAttachment: (jobId: string, attachmentId: number) =>
    request<void>(`/v1/jobs/${jobId}/attachments/${attachmentId}`, { method: 'DELETE' }),

  getJobValueSummary: () => request<JobValueSummaryRow[]>('/v1/reports/job-value'),

  getApiKeys: () => request<ApiKey[]>('/v1/api-keys'),
  // key is only ever present in this one response — never returned again.
  createApiKey: (app: ConsumingApp, label?: string) =>
    request<ApiKey & { key: string }>('/v1/api-keys', { method: 'POST', body: JSON.stringify({ app, label: label || null }) }),
  deleteApiKey: (id: number) => request<void>(`/v1/api-keys/${id}`, { method: 'DELETE' }),
};
