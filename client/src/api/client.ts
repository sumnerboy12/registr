import type {
  ApiKey,
  AppAccess,
  AuthPerson,
  Client,
  ConsumingApp,
  OidcStatus,
  Person,
  Project,
  ProjectAssignment,
  ProjectStatus,
  ProjectType,
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

export const api = {
  getHealth: () => request<{ ok: boolean; commit: string | null }>('/health'),

  getMe: () => request<AuthPerson>('/auth/me'),
  login: (username: string, password: string) =>
    request<AuthPerson>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  changePassword: (current_password: string, new_password: string) =>
    request<void>('/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password, new_password }) }),
  getOidcStatus: () => request<OidcStatus>('/auth/oidc/status'),

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
  setPersonPassword: (personId: number, password: string) =>
    request<void>(`/v1/people/${personId}/set-password`, { method: 'POST', body: JSON.stringify({ password }) }),

  getProjects: (params?: { status?: ProjectStatus; type?: ProjectType; client_id?: number; q?: string; archived?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.type) qs.set('type', params.type);
    if (params?.client_id) qs.set('client_id', String(params.client_id));
    if (params?.q) qs.set('q', params.q);
    if (params?.archived) qs.set('archived', '1');
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<Project[]>(`/v1/projects${suffix}`);
  },
  getProject: (id: string) => request<Project>(`/v1/projects/${id}?include=assignments`),
  createProject: (data: Partial<Project>) => request<Project>('/v1/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: string, data: Partial<Project>) =>
    request<Project>(`/v1/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  addAssignment: (projectId: string, data: { person_id: number; role: string }) =>
    request<ProjectAssignment[]>(`/v1/projects/${projectId}/assignments`, { method: 'POST', body: JSON.stringify(data) }),
  removeAssignment: (projectId: string, assignmentId: number) =>
    request<void>(`/v1/projects/${projectId}/assignments/${assignmentId}`, { method: 'DELETE' }),

  getApiKeys: () => request<ApiKey[]>('/v1/api-keys'),
  // key is only ever present in this one response — never returned again.
  createApiKey: (app: ConsumingApp, label?: string) =>
    request<ApiKey & { key: string }>('/v1/api-keys', { method: 'POST', body: JSON.stringify({ app, label: label || null }) }),
  deleteApiKey: (id: number) => request<void>(`/v1/api-keys/${id}`, { method: 'DELETE' }),
};
