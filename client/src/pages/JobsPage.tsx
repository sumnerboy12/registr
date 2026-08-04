import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { AssignmentRole, Client, Job, JobStatus, JobType, Person } from '../types';
import { ASSIGNMENT_ROLE_LABELS, JOB_STATUS_LABELS, JOB_TYPE_LABELS } from '../types';
import { useAuth } from '../auth/AuthContext';
import ImportModal, { type ImportField } from '../components/ImportModal';
import { downloadCsv, labelToKey } from '../lib/csv';
import { NO_CLIENT_COLOR } from '../lib/colors';

// Covers every field in the Export CSV below, so exporting and re-importing
// the same file round-trips a job exactly — this doubles as backup/restore.
const JOB_IMPORT_FIELDS: ImportField[] = [
  { key: 'code', label: 'Code', aliases: ['code', 'job code', 'job #', 'job number', 'reference', 'ref'] },
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'job', 'job name', 'project', 'project name', 'title'] },
  { key: 'client', label: 'Client', aliases: ['client', 'client name', 'customer', 'customer name'] },
  { key: 'contact_name', label: 'Contact name', aliases: ['contact name', 'contact', 'contact person'] },
  { key: 'contact_email', label: 'Contact email', aliases: ['contact email', 'email', 'email address'] },
  { key: 'type', label: 'Type', aliases: ['type', 'job type'] },
  { key: 'status', label: 'Status', aliases: ['status', 'stage'] },
  { key: 'site_address', label: 'Site address', aliases: ['site address', 'address', 'location'] },
  { key: 'value', label: 'Value', aliases: ['value', 'job value', 'contract value'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments'] },
  { key: 'project_manager', label: 'Project Manager', aliases: ['project manager', 'pm'] },
  { key: 'site_supervisor', label: 'Site Supervisor', aliases: ['site supervisor', 'supervisor', 'foreman'] },
  { key: 'estimator', label: 'Estimator', aliases: ['estimator'] },
  { key: 'qs', label: 'QS', aliases: ['qs', 'quantity surveyor'] },
];

// The four import fields above are keyed the same as AssignmentRole itself
// (project_manager, site_supervisor, estimator, qs), so each can be
// resolved to a person by name and posted as an assignment on import.
const ASSIGNMENT_ROLES = Object.keys(ASSIGNMENT_ROLE_LABELS) as AssignmentRole[];

// Common spreadsheet synonyms that don't match JOB_STATUS_LABELS' own
// wording — Pipeline/Quoted predate this app's Tendering stage, and
// Confirmed is a plain-English stand-in for Awarded. ("In progress" needs
// no entry here — it's now Active's own label.)
const STATUS_SYNONYMS: Record<string, JobStatus> = {
  pipeline: 'tendering',
  quoted: 'tendering',
  confirmed: 'awarded',
};

export default function JobsPage() {
  const { isReadOnly } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<JobStatus | ''>('');
  const [type, setType] = useState<JobType | ''>('');
  const [showImport, setShowImport] = useState(false);

  const loadClients = () => api.getClients().then(setClients);
  const loadPeople = () => api.getPeople({ active: true }).then(setPeople);
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
    loadPeople();
  }, []);
  useEffect(() => {
    loadJobs();
  }, [status, type, q]);

  const clientFor = (id: number | null) => (id != null ? clients.find((c) => c.id === id) : undefined);
  const resolveClientId = (rawName: string | undefined): number | null => {
    const name = rawName?.trim();
    if (!name) return null;
    return clients.find((c) => c.name.trim().toLowerCase() === name.toLowerCase())?.id ?? null;
  };
  const resolvePersonId = (rawName: string | undefined): number | null => {
    const name = rawName?.trim();
    if (!name) return null;
    return people.find((p) => p.name.trim().toLowerCase() === name.toLowerCase())?.id ?? null;
  };

  const exportCsv = () => {
    downloadCsv(
      'jobs.csv',
      ['Code', 'Name', 'Client', 'Contact name', 'Contact email', 'Type', 'Status', 'Site address', 'Value', 'Notes'],
      jobs.map((j) => [
        j.code,
        j.name,
        clientFor(j.client_id)?.name ?? j.client_name ?? '',
        j.contact_name ?? '',
        j.contact_email ?? '',
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
              {jobs.map((job) => {
                const client = clientFor(job.client_id);
                return (
                <tr key={job.id}>
                  <td>{job.code}</td>
                  <td>{job.name}</td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 400,
                        textTransform: 'uppercase',
                        letterSpacing: '0.02em',
                        background: client?.color ?? NO_CLIENT_COLOR,
                        color: '#fff',
                      }}
                    >
                      {client?.name ?? job.client_name ?? 'No client'}
                    </span>
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 400,
                        textTransform: 'uppercase',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {JOB_TYPE_LABELS[job.job_type]}
                    </span>
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 400,
                        textTransform: 'uppercase',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {JOB_STATUS_LABELS[job.status]}
                    </span>
                  </td>
                  <td>
                    <button className="btn" onClick={() => navigate(`/jobs/${encodeURIComponent(job.code)}`)}>
                      {isReadOnly ? 'View' : 'Edit'}
                    </button>
                  </td>
                </tr>
                );
              })}
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
            // A code starting with "M" is always Minor Works, matching how
            // generateJobCode itself prefixes them (see routes/jobs.js) —
            // takes priority over the Type column when both are present.
            const jobType = values.code.trim().toLowerCase().startsWith('m')
              ? ('minor_works' as const)
              : labelToKey(JOB_TYPE_LABELS, values.type) ?? 'contract';
            const jobStatus = STATUS_SYNONYMS[values.status.trim().toLowerCase()] ?? labelToKey(JOB_STATUS_LABELS, values.status);
            const clientId = resolveClientId(values.client);
            const created = await api.createJob({
              code: values.code || undefined,
              name: values.name,
              client_id: clientId,
              // Preserved as free text when the Client column doesn't match
              // an existing client, same as the New Job form.
              client_name: clientId ? null : values.client || null,
              contact_name: values.contact_name || null,
              contact_email: values.contact_email || null,
              job_type: jobType,
              status: jobStatus,
              site_address: values.site_address || null,
              value: value ? Number(value) : null,
              notes: values.notes || null,
            });
            // A name that doesn't match an existing active person is just
            // skipped — same forgiving fallback as an unmatched Client.
            for (const role of ASSIGNMENT_ROLES) {
              const personId = resolvePersonId(values[role]);
              if (personId != null) await api.addAssignment(created.id, { person_id: personId, role });
            }
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
