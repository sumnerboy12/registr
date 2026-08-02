import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ApiKey } from '../types';
import { APP_LABELS } from '../types';
import CreateApiKeyModal from '../components/CreateApiKeyModal';
import { formatDateTime } from '../lib/formatDate';

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

  const revoke = async (key: ApiKey) => {
    if (!confirm(`Revoke the ${APP_LABELS[key.app]} key${key.label ? ` "${key.label}"` : ''}? This can't be undone.`)) return;
    setBusyId(key.id);
    try {
      await api.deleteApiKey(key.id);
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
        once, at creation. Revoking deletes the key permanently — generate a new one if it's needed again.
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
                <th>Created</th>
                <th>Last used</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id}>
                  <td>{APP_LABELS[key.app]}</td>
                  <td>{key.label || '—'}</td>
                  <td>{formatDateTime(key.created_at)}</td>
                  <td>{key.last_used_at ? formatDateTime(key.last_used_at) : 'Never'}</td>
                  <td>
                    <button className="btn btn-danger" onClick={() => revoke(key)} disabled={busyId === key.id}>
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
              {keys.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
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
