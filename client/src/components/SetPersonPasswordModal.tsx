import { useState } from 'react';
import { api } from '../api/client';
import type { Person } from '../types';

interface Props {
  person: Person;
  onClose: () => void;
  onDone: () => void;
}

export default function SetPersonPasswordModal({ person, onClose, onDone }: Props) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (password.length < 8) return setError('Password must be at least 8 characters');
    setSaving(true);
    setError(null);
    try {
      await api.setPersonPassword(person.id, password);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{person.has_password ? 'Reset password' : 'Set password'}</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: -8 }}>
          For {person.name} ({person.username}). They'll be asked to change it on next login.
        </p>
        <div className="field">
          <label>New temporary password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        <div className="modal-actions">
          <div />
          <div className="right">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
