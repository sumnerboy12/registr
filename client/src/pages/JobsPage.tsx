import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Client, Job, JobStatus, JobType } from '../types';
import { JOB_STATUS_LABELS, JOB_TYPE_LABELS } from '../types';
import { useAuth } from '../auth/AuthContext';

export default function JobsPage() {
  const { isReadOnly } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<JobStatus | ''>('');
  const [type, setType] = useState<JobType | ''>('');

  useEffect(() => {
    api.getClients().then(setClients);
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .getJobs({ status: status || undefined, type: type || undefined, q: q || undefined })
      .then((data) => {
        setJobs([...data].sort((a, b) => a.code.localeCompare(b.code)));
        setLoading(false);
      });
  }, [status, type, q]);

  const clientName = (id: number | null) => clients.find((c) => c.id === id)?.name ?? '—';

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Jobs</h1>
        {!isReadOnly && (
          <button className="btn btn-primary" onClick={() => navigate('/jobs/new')}>
            + New Job
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <input placeholder="Search by code, name or client…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value as JobStatus | '')}>
          <option value="">All statuses</option>
          {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as JobType | '')}>
          <option value="">All types</option>
          {Object.entries(JOB_TYPE_LABELS).map(([value, label]) => (
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
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.code}</td>
                  <td>{job.name}</td>
                  <td>{clientName(job.client_id)}</td>
                  <td>{JOB_TYPE_LABELS[job.job_type]}</td>
                  <td>
                    <span className="badge">{JOB_STATUS_LABELS[job.status]}</span>
                  </td>
                  <td>
                    <button className="btn" onClick={() => navigate(`/jobs/${encodeURIComponent(job.code)}`)}>
                      {isReadOnly ? 'View' : 'Edit'}
                    </button>
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
                    No jobs found.
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
