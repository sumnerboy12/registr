import { useState } from 'react';
import type { AppName, Person, Role } from '../types';
import { APP_LABELS } from '../types';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface Props {
  person: Person | null;
  onClose: () => void;
  onSave: (data: Partial<Person>) => Promise<void>;
  onAccessChanged?: () => void;
  readOnly?: boolean;
}

const APPS: AppName[] = ['registr', 'rostr', 'claimr', 'costr'];
const ROLES: Role[] = ['admin', 'editor', 'readonly'];

export default function PersonModal({ person, onClose, onSave, onAccessChanged, readOnly }: Props) {
  const { isAdmin } = useAuth();
  const [name, setName] = useState(person?.name ?? '');
  const [email, setEmail] = useState(person?.email ?? '');
  const [phone, setPhone] = useState(person?.phone ?? '');
  const [roleDefault, setRoleDefault] = useState(person?.role_default ?? '');
  const [availableForScheduling, setAvailableForScheduling] = useState(person?.available_for_scheduling ?? true);
  const [active, setActive] = useState(person?.active ?? true);
  const [notes, setNotes] = useState(person?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newApp, setNewApp] = useState<AppName>('rostr');
  const [newRole, setNewRole] = useState<Role>('editor');
  const [accessBusy, setAccessBusy] = useState(false);

  const [settingPassword, setSettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSet, setPasswordSet] = useState(false);

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
        email,
        phone: phone || null,
        role_default: roleDefault || null,
        available_for_scheduling: availableForScheduling,
        active,
        notes,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const grantAccess = async () => {
    if (!person) return;
    setAccessBusy(true);
    try {
      await api.grantAppAccess(person.id, { app: newApp, role: newRole });
      onAccessChanged?.();
    } finally {
      setAccessBusy(false);
    }
  };

  const revokeAccess = async (app: AppName) => {
    if (!person) return;
    setAccessBusy(true);
    try {
      await api.revokeAppAccess(person.id, app);
      onAccessChanged?.();
    } finally {
      setAccessBusy(false);
    }
  };

  const setPassword = async () => {
    if (!person) return;
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    setPasswordBusy(true);
    setPasswordError(null);
    try {
      await api.setPersonPassword(person.id, newPassword);
      setNewPassword('');
      setSettingPassword(false);
      setPasswordSet(true);
      onAccessChanged?.();
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : 'Failed to set password');
    } finally {
      setPasswordBusy(false);
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
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={readOnly} />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Phone</label>
            <input value={phone ?? ''} onChange={(e) => setPhone(e.target.value)} disabled={readOnly} />
          </div>
          <div className="field">
            <label>Default role</label>
            <input
              value={roleDefault ?? ''}
              onChange={(e) => setRoleDefault(e.target.value)}
              placeholder="e.g. Foreman, Estimator"
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} />
        </div>

        <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={availableForScheduling}
              onChange={(e) => setAvailableForScheduling(e.target.checked)}
              disabled={readOnly}
            />
            Available for scheduling (rostr)
          </label>
          {person && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={readOnly} />
              Active
            </label>
          )}
        </div>

        {person && (
          <div className="field">
            <label>App access</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: isAdmin && !readOnly ? 10 : 0 }}>
              {person.app_access.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No app access granted.</div>}
              {person.app_access.map((a) => (
                <div key={a.app} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                  <span style={{ width: 70 }}>{APP_LABELS[a.app]}</span>
                  <span className="badge">{a.role}</span>
                  {isAdmin && !readOnly && (
                    <button className="btn btn-danger" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => revokeAccess(a.app)} disabled={accessBusy}>
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
            {isAdmin && !readOnly && (
              <div className="row">
                <select value={newApp} onChange={(e) => setNewApp(e.target.value as AppName)} style={{ flex: 1 }}>
                  {APPS.map((a) => (
                    <option key={a} value={a}>
                      {APP_LABELS[a]}
                    </option>
                  ))}
                </select>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)} style={{ flex: 1 }}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button className="btn" onClick={grantAccess} disabled={accessBusy}>
                  Grant
                </button>
              </div>
            )}
          </div>
        )}

        {person && isAdmin && (
          <div className="field">
            <label>Local login (break-glass, alongside SSO)</label>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: settingPassword ? 8 : 0 }}>
              {passwordSet
                ? 'A temporary password was set — they must change it on next login.'
                : person.has_password
                  ? 'This person has a local password set.'
                  : 'No local password — this person can only sign in via SSO.'}
            </div>
            {!settingPassword ? (
              <button className="btn" onClick={() => setSettingPassword(true)}>
                {person.has_password ? 'Reset password' : 'Set password'}
              </button>
            ) : (
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <input
                  type="password"
                  placeholder="New temporary password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary" onClick={setPassword} disabled={passwordBusy}>
                  Save
                </button>
                <button className="btn" onClick={() => { setSettingPassword(false); setNewPassword(''); setPasswordError(null); }}>
                  Cancel
                </button>
              </div>
            )}
            {passwordError && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{passwordError}</div>}
          </div>
        )}

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
