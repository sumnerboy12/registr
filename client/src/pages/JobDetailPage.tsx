import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { AssignmentRole, Client, Person, Job, JobStatus, JobType } from '../types';
import { ASSIGNMENT_ROLE_LABELS, JOB_STATUS_LABELS, JOB_TYPE_LABELS } from '../types';
import { useAuth } from '../auth/AuthContext';

const ASSIGNMENT_ROLES = Object.keys(ASSIGNMENT_ROLE_LABELS) as AssignmentRole[];

// jobValue state stays a plain unformatted numeric string ("1234.5") — this
// only affects how it's displayed while editing. A native number input
// can't show thousand separators (browsers strip them), so Value is a text
// input instead, formatted with commas here and re-parsed back to raw
// digits on every keystroke (see handleValueChange below).
function formatCurrencyInput(raw: string): string {
  if (!raw) return '';
  const [intPart, decPart] = raw.split('.');
  const formattedInt = intPart === '' ? '' : Number(intPart).toLocaleString('en-US');
  return decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
}

export default function JobDetailPage() {
  const { code: codeParam } = useParams();
  const isNew = codeParam === undefined;
  const navigate = useNavigate();
  const { isReadOnly, isAdmin } = useAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(!isNew);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState<number | ''>('');
  const [clientName, setClientName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [jobType, setJobType] = useState<JobType>('contract');
  const [status, setStatus] = useState<JobStatus>('tendering');
  const [siteAddress, setSiteAddress] = useState('');
  const [jobValue, setJobValue] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newPersonId, setNewPersonId] = useState<number | ''>('');
  const [newRole, setNewRole] = useState<AssignmentRole>('project_manager');
  const [assignmentBusy, setAssignmentBusy] = useState(false);

  useEffect(() => {
    api.getClients({ active: true }).then(setClients);
    api.getPeople({ active: true }).then(setPeople);
  }, []);

  // Prefills (and keeps refreshing, if Type changes) a suggested code for a
  // new job — non-admins can't override it, so this is the only way they get
  // one at all. Re-fetches on every jobType change rather than reusing a
  // stale suggestion, since switching type changes which sequence applies.
  useEffect(() => {
    if (!isNew) return;
    api.getNextJobCode(jobType).then((r) => setCode(r.code));
  }, [isNew, jobType]);

  // Populates every editable field from a loaded job.
  const applyJobToForm = (j: Job) => {
    setCode(j.code);
    setName(j.name);
    setClientId(j.client_id ?? '');
    setClientName(j.client_name ?? '');
    setContactName(j.contact_name ?? '');
    setContactEmail(j.contact_email ?? '');
    setJobType(j.job_type);
    setStatus(j.status);
    setSiteAddress(j.site_address ?? '');
    setJobValue(j.value != null ? String(j.value) : '');
    setNotes(j.notes ?? '');
  };

  useEffect(() => {
    if (isNew) return;
    api.getJobByCode(codeParam).then((j) => {
      setJob(j);
      applyJobToForm(j);
      setLoading(false);
    });
  }, [codeParam, isNew]);

  const handleCancel = () => navigate('/');

  const handleSave = async () => {
    if (!code.trim()) return setError('Job code is required');
    if (!name.trim()) return setError('Job name is required');
    setSaving(true);
    setError(null);
    const data = {
      code,
      name,
      client_id: clientId === '' ? null : clientId,
      client_name: clientId === '' ? clientName || null : null,
      contact_name: contactName || null,
      contact_email: contactEmail || null,
      job_type: jobType,
      status,
      site_address: siteAddress || null,
      value: jobValue === '' ? null : Number(jobValue),
      notes: notes || null,
    };
    try {
      if (isNew) {
        await api.createJob(data);
      } else {
        await api.updateJob(job!.id, data);
      }
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!job) return;
    if (!confirm(`Delete ${job.code} - ${job.name}? This also removes its assignments.`)) return;
    setSaving(true);
    setError(null);
    try {
      await api.deleteJob(job.id);
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
      setSaving(false);
    }
  };

  const addAssignment = async () => {
    if (!job || newPersonId === '') return;
    setAssignmentBusy(true);
    try {
      await api.addAssignment(job.id, { person_id: newPersonId, role: newRole });
      const refreshed = await api.getJob(job.id);
      setJob(refreshed);
      setNewPersonId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add assignment');
    } finally {
      setAssignmentBusy(false);
    }
  };

  const removeAssignment = async (assignmentId: number) => {
    if (!job) return;
    setAssignmentBusy(true);
    try {
      await api.removeAssignment(job.id, assignmentId);
      const refreshed = await api.getJob(job.id);
      setJob(refreshed);
    } finally {
      setAssignmentBusy(false);
    }
  };

  if (loading) return <div style={{ padding: 20 }}>Loading…</div>;

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>{isNew ? 'New Job' : job && `${job.code} - ${job.name}`}</h1>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div className="row">
          <div className="field">
            <label>Type</label>
            <select value={jobType} onChange={(e) => setJobType(e.target.value as JobType)} disabled={isReadOnly}>
              {Object.entries(JOB_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} disabled={isReadOnly || !isNew || !isAdmin} />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={isReadOnly} />
          </div>
          <div className="field">
            <label>Client</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : '')} disabled={isReadOnly}>
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {clientId === '' && (
          <div className="field">
            <label>Client name (not in the list above)</label>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} disabled={isReadOnly} />
          </div>
        )}

        <div className="row">
          <div className="field">
            <label>Contact name</label>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} disabled={isReadOnly} />
          </div>
          <div className="field">
            <label>Contact email</label>
            <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} disabled={isReadOnly} />
          </div>
        </div>

        <div className="field">
          <label>Site address</label>
          <input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} disabled={isReadOnly} />
        </div>

        <div className="row">
          <div className="field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as JobStatus)} disabled={isReadOnly}>
              {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {/* Remedial work is billed differently (not a fixed contract sum),
              so Value doesn't apply — hidden rather than just left blank. */}
          {jobType === 'remedial' ? (
            <div className="field" />
          ) : (
            <div className="field">
              <label>Value</label>
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-dim)',
                    pointerEvents: 'none',
                  }}
                >
                  $
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={formatCurrencyInput(jobValue)}
                  onChange={(e) => {
                    // Keep only digits and a single decimal point.
                    let cleaned = e.target.value.replace(/[^0-9.]/g, '');
                    const firstDot = cleaned.indexOf('.');
                    if (firstDot !== -1) {
                      cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
                    }
                    setJobValue(cleaned);
                  }}
                  disabled={isReadOnly}
                  style={{ paddingLeft: 20, width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isReadOnly} />
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        {isReadOnly ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => navigate('/')}>
              Close
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              {isAdmin && !isNew && (
                <button className="btn btn-danger" onClick={handleDelete} disabled={saving}>
                  Delete
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={handleCancel} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>

      {!isNew && job && (
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Assignments</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: isReadOnly ? 0 : 14 }}>
            {(job.assignments ?? []).length === 0 && (
              <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No one assigned yet.</div>
            )}
            {(job.assignments ?? []).map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                <span className="badge" style={{ width: 130, textAlign: 'center' }}>
                  {ASSIGNMENT_ROLE_LABELS[a.role]}
                </span>
                <span>{a.person.name}</span>
                <span style={{ color: 'var(--text-dim)' }}>{a.person.email}</span>
                {!isReadOnly && (
                  <button
                    className="btn btn-danger"
                    style={{ padding: '2px 8px', fontSize: 12, marginLeft: 'auto' }}
                    onClick={() => removeAssignment(a.id)}
                    disabled={assignmentBusy}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          {!isReadOnly && (
            <div className="row">
              <select value={newPersonId} onChange={(e) => setNewPersonId(e.target.value ? Number(e.target.value) : '')} style={{ flex: 2 }}>
                <option value="">Select person…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as AssignmentRole)} style={{ flex: 1 }}>
                {ASSIGNMENT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ASSIGNMENT_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <button className="btn" onClick={addAssignment} disabled={assignmentBusy || newPersonId === ''}>
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
