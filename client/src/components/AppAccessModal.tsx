import { useState } from 'react';
import type { AppName, Person, Role } from '../types';
import { APP_LABELS } from '../types';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface Props {
  person: Person;
  onClose: () => void;
  onChanged: () => void;
}

const APPS: AppName[] = ['registr', 'rostr', 'claimr', 'costr'];
const ROLES: Role[] = ['admin', 'editor', 'readonly'];

type Selection = Role | 'none';

export default function AppAccessModal({ person, onClose, onChanged }: Props) {
  const { user } = useAuth();
  // Local login only ever unlocks registr — SSO is what the other apps need.
  const apps = person.login_type === 'local' ? (['registr'] as AppName[]) : APPS;
  const isSelf = person.id === user?.id;
  const [busyApp, setBusyApp] = useState<AppName | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roleFor = (app: AppName): Selection => person.app_access.find((a) => a.app === app)?.role ?? 'none';

  const handleChange = async (app: AppName, selection: Selection) => {
    setBusyApp(app);
    setError(null);
    try {
      if (selection === 'none') {
        await api.revokeAppAccess(person.id, app);
      } else {
        await api.grantAppAccess(person.id, { app, role: selection });
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update access');
    } finally {
      setBusyApp(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>App Access — {person.name}</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {apps.map((app) => {
            const lockSelf = isSelf && app === 'registr';
            return (
              <div key={app} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 14 }}>{APP_LABELS[app]}</span>
                <select
                  value={roleFor(app)}
                  onChange={(e) => handleChange(app, e.target.value as Selection)}
                  disabled={busyApp === app || lockSelf}
                  title={lockSelf ? "You can't change your own Registr access" : undefined}
                  style={{ flex: 1 }}
                >
                  <option value="none">No access</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        {isSelf && apps.includes('registr') && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 8 }}>
            Your own Registr access is locked here — have another admin change it if needed.
          </div>
        )}
        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{error}</div>}

        <div className="modal-actions">
          <div />
          <div className="right">
            <button className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
