import { useState } from 'react';
import type { AssignmentRole, Person } from '../types';
import { ASSIGNMENT_ROLE_LABELS } from '../types';
import { api } from '../api/client';

const ASSIGNMENT_ROLES = Object.keys(ASSIGNMENT_ROLE_LABELS) as AssignmentRole[];

interface Props {
  jobId: string;
  people: Person[];
  onClose: () => void;
  onAdded: () => void;
}

export default function AddAssignmentModal({ jobId, people, onClose, onAdded }: Props) {
  const [personId, setPersonId] = useState<number | ''>('');
  const [role, setRole] = useState<AssignmentRole>('project_manager');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (personId === '') return;
    setBusy(true);
    setError(null);
    try {
      await api.addAssignment(jobId, { person_id: personId, role });
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add assignment');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add Role</h2>

        <div className="field">
          <label>Person</label>
          <select value={personId} onChange={(e) => setPersonId(e.target.value ? Number(e.target.value) : '')} autoFocus>
            <option value="">Select person…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as AssignmentRole)}>
            {ASSIGNMENT_ROLES.map((r) => (
              <option key={r} value={r}>
                {ASSIGNMENT_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{error}</div>}

        <div className="modal-actions">
          <div />
          <div className="right">
            <button className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleAdd} disabled={busy || personId === ''}>
              {busy ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
