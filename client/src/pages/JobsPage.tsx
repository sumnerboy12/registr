import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { AssignmentRole, Client, Job, JobStatus, JobType, Person } from '../types';
import { ASSIGNMENT_ROLE_LABELS, CONTRACT_ONLY_STATUSES, JOB_STATUS_LABELS, JOB_TYPE_LABELS } from '../types';
import { useAuth } from '../auth/AuthContext';
import ImportModal, { type ImportField } from '../components/ImportModal';
import StatusFilterDropdown, { ALL_STATUSES } from '../components/StatusFilterDropdown';
import JobTypeFilterDropdown, { ALL_JOB_TYPES } from '../components/JobTypeFilterDropdown';
import { downloadCsv, labelToKey } from '../lib/csv';
import { NO_CLIENT_COLOR } from '../lib/colors';
import WarningBadge from '../components/WarningBadge';

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

const VIEW_STORAGE_KEY = 'registr-jobs-view';
const STATUS_FILTER_KEY = 'registr-jobs-status-filter';
const TYPE_FILTER_KEY = 'registr-jobs-type-filter';

function loadPersistedView(): 'list' | 'board' {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    if (raw === 'list' || raw === 'board') return raw;
  } catch {
    // storage unavailable — just use the default
  }
  return 'list';
}

// Shared by the Status/Type filter loaders below — validates against the
// current known values so a status/type removed since the value was saved
// doesn't linger in the filter forever.
function loadPersistedFilter<T extends string>(key: string, allValues: T[], fallback: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    return parsed.filter((v): v is T => allValues.includes(v as T));
  } catch {
    return fallback;
  }
}

function savePersistedFilter(key: string, values: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // storage unavailable — selection just won't persist
  }
}

// A very faint row tint per job type — just enough to scan the list by
// type at a glance, without competing with the Type pill or hurting
// readability of the row's own text. The colour itself is server-computed
// (job.job_type_color, see JOB_TYPE_COLORS in server/src/lib/jobTypes.js) so
// every app that lists jobs — rostr included — tints a job's row the same
// way instead of each maintaining its own copy of the colour choice.
const jobTypeRowTint = (job: Job) => `color-mix(in srgb, ${job.job_type_color} 12%, transparent)`;

// Reasons the WarningBadge next to a job's name should show a tooltip for —
// currently just the ThinkSafe check, but more checks can push onto this
// array without either call site (board card, list row) needing to change.
const jobWarnings = (job: Job) => [!job.thinksafe_site && 'No site configured in ThinkSafe'].filter((w): w is string => !!w);

export default function JobsPage() {
  const { user, isReadOnly, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus[]>(() =>
    loadPersistedFilter(STATUS_FILTER_KEY, ALL_STATUSES, ALL_STATUSES)
  );
  const [typeFilter, setTypeFilter] = useState<JobType[]>(() => loadPersistedFilter(TYPE_FILTER_KEY, ALL_JOB_TYPES, ALL_JOB_TYPES));
  // Server-side (unlike status/type, which filter the already-fetched list
  // client-side) — matches every role, not just PM, unlike the QA
  // Outstanding report's own PM-only "mine". Not persisted like the other
  // filters; always starts unchecked.
  const [mineOnly, setMineOnly] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [view, setView] = useState<'list' | 'board'>(loadPersistedView);
  const [dragOverStatus, setDragOverStatus] = useState<JobStatus | null>(null);

  // Click-and-drag-to-scroll for the board view, so it doesn't need its own
  // visible horizontal scrollbar (see the board container below). Mutates
  // the DOM directly rather than via state — a scroll happens on every
  // mousemove pixel, and that doesn't need to trigger a re-render.
  // Horizontal scroll happens on this container itself; vertical scroll
  // happens on Layout.tsx's <main> (the actual overflow:auto ancestor —
  // the board container has no vertical overflow of its own).
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const panState = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number; scrollEl: HTMLElement } | null>(
    null
  );

  const handleBoardMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't hijack a job card's own native drag (status change) or clicks
    // on any other interactive element.
    const target = e.target as HTMLElement;
    if (target.closest('[draggable="true"], button, a, input, select, textarea')) return;
    const el = boardScrollRef.current;
    const scrollEl = el?.closest('main');
    if (!el || !scrollEl) return;
    panState.current = { startX: e.pageX, startY: e.pageY, scrollLeft: el.scrollLeft, scrollTop: scrollEl.scrollTop, scrollEl };
    el.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = panState.current;
      const el = boardScrollRef.current;
      if (!state || !el) return;
      el.scrollLeft = state.scrollLeft - (e.pageX - state.startX);
      state.scrollEl.scrollTop = state.scrollTop - (e.pageY - state.startY);
    };
    const stopPanning = () => {
      panState.current = null;
      document.body.style.userSelect = '';
      if (boardScrollRef.current) boardScrollRef.current.style.cursor = 'grab';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopPanning);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopPanning);
    };
  }, []);

  // Auto-scrolls the board while dragging a card near its left/right edge —
  // native dragover fires repeatedly during a drag, but a rAF loop scrolls
  // smoothly rather than in per-event jumps and keeps going even if dragover
  // itself pauses firing.
  const edgeScrollSpeedRef = useRef(0);
  const edgeScrollFrameRef = useRef<number | null>(null);

  const stepEdgeScroll = () => {
    const el = boardScrollRef.current;
    if (el && edgeScrollSpeedRef.current !== 0) el.scrollLeft += edgeScrollSpeedRef.current;
    edgeScrollFrameRef.current = requestAnimationFrame(stepEdgeScroll);
  };

  const handleBoardDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const el = boardScrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const EDGE = 60;
    const MAX_SPEED = 18;
    if (e.clientX < rect.left + EDGE) {
      edgeScrollSpeedRef.current = -MAX_SPEED * ((rect.left + EDGE - e.clientX) / EDGE);
    } else if (e.clientX > rect.right - EDGE) {
      edgeScrollSpeedRef.current = MAX_SPEED * ((e.clientX - (rect.right - EDGE)) / EDGE);
    } else {
      edgeScrollSpeedRef.current = 0;
    }
    if (edgeScrollFrameRef.current == null) edgeScrollFrameRef.current = requestAnimationFrame(stepEdgeScroll);
  };

  const stopEdgeScroll = () => {
    edgeScrollSpeedRef.current = 0;
    if (edgeScrollFrameRef.current != null) {
      cancelAnimationFrame(edgeScrollFrameRef.current);
      edgeScrollFrameRef.current = null;
    }
  };

  useEffect(() => stopEdgeScroll, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      // storage unavailable — selection just won't persist
    }
  }, [view]);

  useEffect(() => savePersistedFilter(STATUS_FILTER_KEY, statusFilter), [statusFilter]);
  useEffect(() => savePersistedFilter(TYPE_FILTER_KEY, typeFilter), [typeFilter]);

  const loadClients = () => api.getClients().then(setClients);
  const loadPeople = () => api.getPeople({ active: true }).then(setPeople);
  const loadJobs = () => {
    setLoading(true);
    // archived: true so closed jobs are fetched too — status/type filtering
    // is all client-side now (see sortedJobs below), to support the
    // multi-select Status/JobTypeFilterDropdowns. mine, unlike those, is
    // applied server-side (see routes/jobs.js).
    return api
      .getJobs({ q: q || undefined, archived: true, mine: mineOnly })
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
  }, [q, mineOnly]);

  const clientFor = (id: number | null) => (id != null ? clients.find((c) => c.id === id) : undefined);

  // Practical Completion / Awaiting Retentions only apply to Contract jobs
  // (see routes/jobs.js's CONTRACT_ONLY_STATUSES) — hidden from both the
  // Status filter and the board's columns unless Contract is part of the
  // current Type selection.
  const visibleStatuses = useMemo(
    () => (typeFilter.includes('contract') ? ALL_STATUSES : ALL_STATUSES.filter((s) => !CONTRACT_ONLY_STATUSES.includes(s))),
    [typeFilter]
  );

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

  // Board view groups by status itself (one column per status), so this
  // only applies Type — no q re-filtering needed either, loadJobs already
  // fetched from the server with it.
  const boardJobs = useMemo(
    () =>
      jobs
        .filter((j) => typeFilter.includes(j.job_type))
        .sort((a, b) => {
          const clientA = clientFor(a.client_id)?.name ?? a.client_name ?? '';
          const clientB = clientFor(b.client_id)?.name ?? b.client_name ?? '';
          return clientA.localeCompare(clientB) || a.code.localeCompare(b.code);
        }),
    [jobs, clients, typeFilter]
  );

  // Now shown (and used to choose which status columns appear) in Board
  // mode too, not just List — see the toolbar below.
  const boardStatuses = useMemo(() => visibleStatuses.filter((s) => statusFilter.includes(s)), [visibleStatuses, statusFilter]);

  // Optimistic — the board would otherwise visibly snap the card back to
  // its old column until loadJobs's response lands.
  const handleDropOnColumn = async (jobId: string, newStatus: JobStatus) => {
    setDragOverStatus(null);
    const job = jobs.find((j) => j.id === jobId);
    if (!job || job.status === newStatus) return;
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j)));
    try {
      await api.updateJob(job.id, { status: newStatus });
    } catch (e) {
      setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: job.status } : j)));
      alert(e instanceof Error ? e.message : 'Failed to move job');
    }
  };

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
    <div style={{ padding: 20, maxWidth: view === 'board' ? 1800 : 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Jobs</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn" onClick={exportCsv}>
            Export
          </button>
          {isAdmin && (
            <button className="btn" onClick={() => setShowImport(true)}>
              Import
            </button>
          )}
          {!isReadOnly && (
            <button className="btn btn-primary" onClick={() => navigate('/jobs/new')}>
              + Add Job
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input placeholder="Search by code, name or client…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} autoFocus />
          <StatusFilterDropdown value={statusFilter} onChange={setStatusFilter} statuses={visibleStatuses} />
          <JobTypeFilterDropdown value={typeFilter} onChange={setTypeFilter} />
          {user?.id != null && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
              My Jobs
            </label>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn"
            onClick={() => setView('list')}
            style={{ background: view === 'list' ? 'var(--nav-accent)' : undefined, borderColor: view === 'list' ? 'var(--nav-accent)' : undefined }}
          >
            List
          </button>
          <button
            className="btn"
            onClick={() => setView('board')}
            style={{ background: view === 'board' ? 'var(--nav-accent)' : undefined, borderColor: view === 'board' ? 'var(--nav-accent)' : undefined }}
          >
            Board
          </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 20 }}>
          Loading…
        </div>
      ) : view === 'board' ? (
        <div
          ref={boardScrollRef}
          className="scrollbar-none"
          onMouseDown={handleBoardMouseDown}
          onDragOver={handleBoardDragOver}
          style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start', cursor: 'grab' }}
        >
          {boardStatuses.map((status) => {
            const columnJobs = boardJobs.filter((j) => j.status === status);
            return (
              <div key={status} style={{ flex: '0 0 250px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 2px' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    {JOB_STATUS_LABELS[status]}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{columnJobs.length}</span>
                </div>
                <div
                  className="card"
                  onDragOver={(e) => {
                    if (isReadOnly) return;
                    e.preventDefault();
                    if (dragOverStatus !== status) setDragOverStatus(status);
                  }}
                  onDragLeave={() => setDragOverStatus((s) => (s === status ? null : s))}
                  onDrop={(e) => {
                    if (isReadOnly) return;
                    e.preventDefault();
                    const jobId = e.dataTransfer.getData('text/plain');
                    if (jobId) handleDropOnColumn(jobId, status);
                  }}
                  style={{
                    padding: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    minHeight: 60,
                    outline: dragOverStatus === status ? '2px solid var(--accent)' : undefined,
                    outlineOffset: -2,
                  }}
                >
                  {columnJobs.map((job) => {
                    const client = clientFor(job.client_id);
                    return (
                      <div
                        key={job.id}
                        draggable={!isReadOnly}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', String(job.id));
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={stopEdgeScroll}
                        onClick={() => navigate(`/jobs/${encodeURIComponent(job.code)}`)}
                        style={{
                          position: 'relative',
                          cursor: isReadOnly ? 'pointer' : 'grab',
                          padding: 10,
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: jobTypeRowTint(job),
                          opacity: INACTIVE_STATUSES.includes(job.status) ? 0.5 : 1,
                        }}
                      >
                        <span style={{ position: 'absolute', top: 8, right: 8 }}>
                          <WarningBadge reasons={jobWarnings(job)} />
                        </span>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, paddingRight: 26 }}>
                          {job.name}
                        </div>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
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
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                          <span>
                            {JOB_TYPE_LABELS[job.job_type]} &middot; {job.code}
                          </span>
                          <span>{job.job_type !== 'remedial' && job.value != null ? `$${job.value.toLocaleString('en-US')}` : ''}</span>
                        </div>
                      </div>
                    );
                  })}
                  {columnJobs.length === 0 && (
                    <div style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center', padding: 12 }}>No jobs</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
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
                    background: jobTypeRowTint(job),
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
                  <td>
                    {job.name}
                    {' '}
                    <WarningBadge reasons={jobWarnings(job)} />
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
        </div>
      )}

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
            const jobType = labelToKey(JOB_TYPE_LABELS, values.type) ?? 'contract';
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
