import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { AssignmentRole, Client, Job, JobStatus, JobType, Person } from '../types';
import { ASSIGNMENT_ROLE_LABELS, JOB_STATUS_LABELS, JOB_TYPE_LABELS } from '../types';
import { useAuth } from '../auth/AuthContext';
import ImportModal, { type ImportField } from '../components/ImportModal';
import StatusFilterDropdown, { ALL_STATUSES } from '../components/StatusFilterDropdown';
import JobTypeFilterDropdown, { ALL_JOB_TYPES } from '../components/JobTypeFilterDropdown';
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

// Dimmed in the list — not actively being worked, same idea as an inactive
// person/client/plant row.
const INACTIVE_STATUSES: JobStatus[] = ['closed', 'on_hold', 'lost'];

// A very faint row tint per job type — just enough to scan the list by
// type at a glance, without competing with the Type pill or hurting
// readability of the row's own text.
const JOB_TYPE_ROW_TINT: Record<JobType, string> = {
  contract: 'color-mix(in srgb, var(--accent) 8%, transparent)',
  minor_works: 'color-mix(in srgb, #3b82f6 8%, transparent)',
  remedial: 'color-mix(in srgb, var(--warn) 10%, transparent)',
};

export default function JobsPage() {
  const { isReadOnly } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus[]>(ALL_STATUSES);
  const [typeFilter, setTypeFilter] = useState<JobType[]>(ALL_JOB_TYPES);
  const [showImport, setShowImport] = useState(false);

  const loadClients = () => api.getClients().then(setClients);
  const loadPeople = () => api.getPeople({ active: true }).then(setPeople);
  const loadJobs = () => {
    setLoading(true);
    // archived: true so closed jobs are fetched too — status/type filtering
    // is all client-side now (see sortedJobs below), to support the
    // multi-select Status/JobTypeFilterDropdowns.
    return api
      .getJobs({ q: q || undefined, archived: true })
      .then((data) => {
        setJobs(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadClients();
    loadPeople();
  }, []);
  useEffect(() => {
    loadJobs();
  }, [q]);

  const clientFor = (id: number | null) => (id != null ? clients.find((c) => c.id === id) : undefined);

  const sortedJobs = useMemo(
    () =>
      jobs
        .filter((j) => statusFilter.includes(j.status) && typeFilter.includes(j.job_type))
        .sort((a, b) => {
          const clientA = clientFor(a.client_id)?.name ?? a.client_name ?? '';
          const clientB = clientFor(b.client_id)?.name ?? b.client_name ?? '';
          return clientA.localeCompare(clientB) || a.code.localeCompare(b.code);
        }),
    [jobs, clients, statusFilter, typeFilter]
  );

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
        <StatusFilterDropdown value={statusFilter} onChange={setStatusFilter} />
        <JobTypeFilterDropdown value={typeFilter} onChange={setTypeFilter} />
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 20 }}>Loading…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedJobs.map((job) => {
                const client = clientFor(job.client_id);
                return (
                <tr
                  key={job.id}
                  style={{
                    opacity: INACTIVE_STATUSES.includes(job.status) ? 0.5 : 1,
                    background: JOB_TYPE_ROW_TINT[job.job_type],
                  }}
                >
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: 999,
                        fontSize: 11,
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
                  <td>{job.code}</td>
                  <td>{job.name}</td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: 999,
                        fontSize: 11,
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
                        fontSize: 11,
                        fontWeight: 400,
                        textTransform: 'uppercase',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {JOB_STATUS_LABELS[job.status]}
                    </span>
                  </td>
                  <td>{job.job_type !== 'remedial' && job.value != null ? `$${job.value.toLocaleString('en-US')}` : '—'}</td>
                  <td>
                    <button className="btn" onClick={() => navigate(`/jobs/${encodeURIComponent(job.code)}`)}>
                      {isReadOnly ? 'View' : 'Edit'}
                    </button>
                  </td>
                </tr>
                );
              })}
              {sortedJobs.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
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
            // A code starting with "M"/"R" is always Minor Works/Remedial,
            // matching how generateJobCode itself prefixes them (see
            // routes/jobs.js) — takes priority over the Type column when
            // both are present.
            const codePrefix = values.code.trim().toLowerCase().charAt(0);
            const jobType =
              codePrefix === 'm'
                ? ('minor_works' as const)
                : codePrefix === 'r'
                  ? ('remedial' as const)
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
