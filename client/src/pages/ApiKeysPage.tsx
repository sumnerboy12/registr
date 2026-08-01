import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ApiKey } from '../types';
import { APP_LABELS } from '../types';
import CreateApiKeyModal from '../components/CreateApiKeyModal';

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    api.getApiKeys().then((data) => {
      setKeys(data);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const toggleActive = async (key: ApiKey) => {
    setBusyId(key.id);
    try {
      await api.setApiKeyActive(key.id, !key.active);
      load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>API Keys</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + Generate Key
        </button>
      </div>

      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0 }}>
        Server-to-server credentials for rostr, claimr, and costr to check registr access. Each key's plaintext is shown
        once, at creation.
      </p>

      <div className="card">
        {loading ? (
          <div style={{ padding: 20 }}>Loading…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>App</th>
                <th>Label</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last used</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} style={{ opacity: key.active ? 1 : 0.5 }}>
                  <td>{APP_LABELS[key.app]}</td>
                  <td>{key.label || '—'}</td>
                  <td>{key.active ? 'Active' : 'Revoked'}</td>
                  <td>{key.created_at}</td>
                  <td>{key.last_used_at || 'Never'}</td>
                  <td>
                    <button
                      className={key.active ? 'btn btn-danger' : 'btn'}
                      onClick={() => toggleActive(key)}
                      disabled={busyId === key.id}
                    >
                      {key.active ? 'Revoke' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
              {keys.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
                    No API keys yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <CreateApiKeyModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  );
}
