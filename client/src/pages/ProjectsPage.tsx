import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Client, Project, ProjectStatus, ProjectType } from '../types';
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '../types';
import { useAuth } from '../auth/AuthContext';

export default function ProjectsPage() {
  const { isReadOnly } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ProjectStatus | ''>('');
  const [type, setType] = useState<ProjectType | ''>('');

  useEffect(() => {
    api.getClients().then(setClients);
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .getProjects({ status: status || undefined, type: type || undefined, q: q || undefined })
      .then((data) => {
        setProjects([...data].sort((a, b) => a.code.localeCompare(b.code)));
        setLoading(false);
      });
  }, [status, type, q]);

  const clientName = (id: number | null) => clients.find((c) => c.id === id)?.name ?? '—';

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Projects</h1>
        {!isReadOnly && (
          <button className="btn btn-primary" onClick={() => navigate('/projects/new')}>
            + New Project
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <input placeholder="Search by code or name…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | '')}>
          <option value="">All statuses</option>
          {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as ProjectType | '')}>
          <option value="">All types</option>
          {Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 20 }}>Loading…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Client</th>
                <th>Type</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>{project.code}</td>
                  <td>{project.name}</td>
                  <td>{clientName(project.client_id)}</td>
                  <td>{PROJECT_TYPE_LABELS[project.project_type]}</td>
                  <td>
                    <span className="badge">{PROJECT_STATUS_LABELS[project.status]}</span>
                  </td>
                  <td>
                    <button className="btn" onClick={() => navigate(`/projects/${project.id}`)}>
                      {isReadOnly ? 'View' : 'Edit'}
                    </button>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
                    No projects found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
