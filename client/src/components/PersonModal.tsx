import { useState } from 'react';
import type { LoginType, Person } from '../types';
import { SWATCH_COLORS } from '../lib/colors';
import ColorSwatchPicker from './ColorSwatchPicker';
import { useAuth } from '../auth/AuthContext';

interface Props {
  person: Person | null;
  onClose: () => void;
  onSave: (data: Partial<Person>) => Promise<void>;
  readOnly?: boolean;
}

export default function PersonModal({ person, onClose, onSave, readOnly }: Props) {
  const { user } = useAuth();
  const isSelf = !!person && person.id === user?.id;
  const [name, setName] = useState(person?.name ?? '');
  const [loginType, setLoginType] = useState<LoginType>(person?.login_type ?? 'sso');
  const [email, setEmail] = useState(person?.email ?? '');
  const [phone, setPhone] = useState(person?.phone ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(person?.date_of_birth ?? '');
  const [employmentStartDate, setEmploymentStartDate] = useState(person?.employment_start_date ?? '');
  const [role, setRole] = useState(person?.role ?? '');
  const [billable, setBillable] = useState(person?.billable ?? true);
  const [active, setActive] = useState(person?.active ?? true);
  const [color, setColor] = useState(person?.color ?? SWATCH_COLORS[8]);
  const [notes, setNotes] = useState(person?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name,
        login_type: loginType,
        email: email || null,
        phone: phone || null,
        date_of_birth: dateOfBirth || null,
        employment_start_date: employmentStartDate || null,
        role: role || null,
        billable,
        active,
        color,
        notes,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>{person ? (readOnly ? 'View Person' : 'Edit Person') : 'New Person'}</h2>

        <div className="row">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus disabled={readOnly} />
          </div>
          <div className="field">
            <label>Role</label>
            <input
              value={role ?? ''}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Foreman, Estimator"
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Login type</label>
            <select value={loginType} onChange={(e) => setLoginType(e.target.value as LoginType)} disabled={readOnly}>
              <option value="sso">SSO</option>
              <option value="none">None</option>
            </select>
          </div>
          <div className="field">
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={readOnly} />
          </div>
        </div>

        {loginType === 'sso' && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: -8, marginBottom: 12 }}>
            Email address must match the email their identity provider signs them in with.
          </div>
        )}

        {loginType === 'none' && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: -8, marginBottom: 12 }}>
            No sign-in — email is still used for sending schedules and other notifications.
          </div>
        )}

        <div className="row" style={{ marginBottom: 12 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Phone</label>
              <input value={phone ?? ''} onChange={(e) => setPhone(e.target.value)} disabled={readOnly} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Date of birth</label>
              <input type="date" value={dateOfBirth ?? ''} onChange={(e) => setDateOfBirth(e.target.value)} disabled={readOnly} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Employment start date</label>
              <input
                type="date"
                value={employmentStartDate ?? ''}
                onChange={(e) => setEmploymentStartDate(e.target.value)}
                disabled={readOnly}
              />
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Colour</label>
              <ColorSwatchPicker value={color} onChange={setColor} disabled={readOnly} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, height: 32 }}>
              {person && (
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}
                  title={isSelf ? "You can't make your own account inactive" : undefined}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    disabled={readOnly || isSelf}
                  />
                  Active
                </label>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} disabled={readOnly} />
                Billable
              </label>
            </div>
          </div>
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} />
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        <div className="modal-actions">
          <div />
          <div className="right">
            <button className="btn" onClick={onClose}>
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {!readOnly && (
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
