import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { AssignmentRole, Client, Person, Project, ProjectStatus, ProjectType } from '../types';
import { ASSIGNMENT_ROLE_LABELS, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '../types';
import { useAuth } from '../auth/AuthContext';

const ASSIGNMENT_ROLES = Object.keys(ASSIGNMENT_ROLE_LABELS) as AssignmentRole[];

export default function ProjectDetailPage() {
  const { id } = useParams();
  const isNew = id === undefined;
  const navigate = useNavigate();
  const { isReadOnly } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(!isNew);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState<number | ''>('');
  const [projectType, setProjectType] = useState<ProjectType>('contract');
  const [status, setStatus] = useState<ProjectStatus>('tendering');
  const [siteAddress, setSiteAddress] = useState('');
  const [contractValue, setContractValue] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newPersonId, setNewPersonId] = useState<number | ''>('');
  const [newRole, setNewRole] = useState<AssignmentRole>('project_manager');
  const [assignmentBusy, setAssignmentBusy] = useState(false);

  useEffect(() => {
    api.getClients({ active: true }).then(setClients);
    api.getPeople({ active: true }).then(setPeople);
  }, []);

  useEffect(() => {
    if (isNew) return;
    api.getProject(id).then((p) => {
      setProject(p);
      setCode(p.code);
      setName(p.name);
      setClientId(p.client_id ?? '');
      setProjectType(p.project_type);
      setStatus(p.status);
      setSiteAddress(p.site_address ?? '');
      setContractValue(p.contract_value != null ? String(p.contract_value) : '');
      setStartDate(p.start_date ?? '');
      setEndDate(p.end_date ?? '');
      setLoading(false);
    });
  }, [id, isNew]);

  const handleSave = async () => {
    if (!code.trim()) return setError('Project code is required');
    if (!name.trim()) return setError('Project name is required');
    setSaving(true);
    setError(null);
    const data = {
      code,
      name,
      client_id: clientId === '' ? null : clientId,
      project_type: projectType,
      status,
      site_address: siteAddress || null,
      contract_value: contractValue === '' ? null : Number(contractValue),
      start_date: startDate || null,
      end_date: endDate || null,
    };
    try {
      if (isNew) {
        const created = await api.createProject(data);
        navigate(`/projects/${created.id}`, { replace: true });
      } else {
        const updated = await api.updateProject(id, data);
        setProject(updated);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const addAssignment = async () => {
    if (!project || newPersonId === '') return;
    setAssignmentBusy(true);
    try {
      await api.addAssignment(project.id, { person_id: newPersonId, role: newRole });
      const refreshed = await api.getProject(project.id);
      setProject(refreshed);
      setNewPersonId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add assignment');
    } finally {
      setAssignmentBusy(false);
    }
  };

  const removeAssignment = async (assignmentId: number) => {
    if (!project) return;
    setAssignmentBusy(true);
    try {
      await api.removeAssignment(project.id, assignmentId);
      const refreshed = await api.getProject(project.id);
      setProject(refreshed);
    } finally {
      setAssignmentBusy(false);
    }
  };

  if (loading) return <div style={{ padding: 20 }}>Loading…</div>;

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>{isNew ? 'New Project' : project?.code}</h1>
        <button className="btn" onClick={() => navigate('/')}>
          Back to Projects
        </button>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div className="row">
          <div className="field">
            <label>Code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} disabled={isReadOnly} />
          </div>
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={isReadOnly} />
          </div>
        </div>

        <div className="row">
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
          <div className="field">
            <label>Type</label>
            <select value={projectType} onChange={(e) => setProjectType(e.target.value as ProjectType)} disabled={isReadOnly}>
              {Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} disabled={isReadOnly}>
              {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Site address</label>
          <input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} disabled={isReadOnly} />
        </div>

        <div className="row">
          <div className="field">
            <label>Contract value</label>
            <input
              type="number"
              value={contractValue}
              onChange={(e) => setContractValue(e.target.value)}
              placeholder="Blank for tendering / minor works"
              disabled={isReadOnly}
            />
          </div>
          <div className="field">
            <label>Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={isReadOnly} />
          </div>
          <div className="field">
            <label>End date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={isReadOnly} />
          </div>
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        {!isReadOnly && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create Project' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {!isNew && project && (
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Assignments</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: isReadOnly ? 0 : 14 }}>
            {(project.assignments ?? []).length === 0 && (
              <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No one assigned yet.</div>
            )}
            {(project.assignments ?? []).map((a) => (
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
