import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Client, Job, JobStatus, JobType } from '../types';
import { JOB_STATUS_LABELS, JOB_TYPE_LABELS } from '../types';
import { useAuth } from '../auth/AuthContext';
import ImportModal, { type ImportField } from '../components/ImportModal';
import { downloadCsv, labelToKey } from '../lib/csv';

// Covers every field in the Export CSV below, so exporting and re-importing
// the same file round-trips a job exactly — this doubles as backup/restore.
const JOB_IMPORT_FIELDS: ImportField[] = [
  { key: 'code', label: 'Code', aliases: ['code', 'job code', 'job #', 'job number', 'reference', 'ref'] },
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'job', 'job name', 'project', 'project name', 'title'] },
  { key: 'client', label: 'Client', aliases: ['client', 'client name', 'customer', 'customer name'] },
  { key: 'type', label: 'Type', aliases: ['type', 'job type'] },
  { key: 'status', label: 'Status', aliases: ['status', 'stage'] },
  { key: 'site_address', label: 'Site address', aliases: ['site address', 'address', 'location'] },
  { key: 'value', label: 'Value', aliases: ['value', 'job value', 'contract value'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments'] },
];

export default function JobsPage() {
  const { isReadOnly } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<JobStatus | ''>('');
  const [type, setType] = useState<JobType | ''>('');
  const [showImport, setShowImport] = useState(false);

  const loadClients = () => api.getClients().then(setClients);
  const loadJobs = () => {
    setLoading(true);
    return api
      .getJobs({ status: status || undefined, type: type || undefined, q: q || undefined })
      .then((data) => {
        setJobs([...data].sort((a, b) => a.code.localeCompare(b.code)));
        setLoading(false);
      });
  };

  useEffect(() => {
    loadClients();
  }, []);
  useEffect(() => {
    loadJobs();
  }, [status, type, q]);

  const clientName = (id: number | null) => clients.find((c) => c.id === id)?.name ?? '—';
  const resolveClientId = (rawName: string | undefined): number | null => {
    const name = rawName?.trim();
    if (!name) return null;
    return clients.find((c) => c.name.trim().toLowerCase() === name.toLowerCase())?.id ?? null;
  };

  const exportCsv = () => {
    downloadCsv(
      'jobs.csv',
      ['Code', 'Name', 'Client', 'Type', 'Status', 'Site address', 'Value', 'Notes'],
      jobs.map((j) => [
        j.code,
        j.name,
        (j.client_id != null ? clients.find((c) => c.id === j.client_id)?.name : undefined) ?? '',
        JOB_TYPE_LABELS[j.job_type],
        JOB_STATUS_LABELS[j.status],
        j.site_address ?? '',
        j.value ?? '',
        j.notes ?? '',
      ])
    );
  };

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Jobs</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn" onClick={exportCsv}>
            Export
          </button>
          {!isReadOnly && (
            <>
              <button className="btn" onClick={() => setShowImport(true)}>
                Import
              </button>
              <button className="btn btn-primary" onClick={() => navigate('/jobs/new')}>
                + Add Job
              </button>
            </>
          )}
        </div>
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

      {showImport && (
        <ImportModal
          title="Import Jobs"
          fields={JOB_IMPORT_FIELDS}
          existingKeys={new Set(jobs.filter((j) => j.code).map((j) => j.code.trim().toLowerCase()))}
          // Rows with no code mapped (or left blank, e.g. for auto-generation) are
          // never treated as duplicates of each other.
          getKey={(values) => values.code.trim().toLowerCase()}
          onClose={() => setShowImport(false)}
          onImportRow={async (values) => {
            const value = values.value.replace(/[^0-9.-]/g, '');
            await api.createJob({
              code: values.code || undefined,
              name: values.name,
              client_id: resolveClientId(values.client),
              job_type: labelToKey(JOB_TYPE_LABELS, values.type) ?? 'contract',
              status: labelToKey(JOB_STATUS_LABELS, values.status),
              site_address: values.site_address || null,
              value: value ? Number(value) : null,
              notes: values.notes || null,
            });
          }}
          onDone={() => {
            loadJobs();
            loadClients();
          }}
        />
      )}
    </div>
  );
}
