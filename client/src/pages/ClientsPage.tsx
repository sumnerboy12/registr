import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Client } from '../types';
import { CLIENT_TYPE_LABELS } from '../types';
import { useAuth } from '../auth/AuthContext';
import ClientModal from '../components/ClientModal';

export default function ClientsPage() {
  const { isReadOnly } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Client | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = () => {
    api.getClients().then((data) => {
      setClients(data);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const filtered = clients.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Clients</h1>
        {!isReadOnly && (
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            + Add Client
          </button>
        )}
      </div>

      <input placeholder="Search clients…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280, marginBottom: 12 }} />

      <div className="card">
        {loading ? (
          <div style={{ padding: 20 }}>Loading…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Contact</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr key={client.id}>
                  <td>{client.name}</td>
                  <td>{CLIENT_TYPE_LABELS[client.type]}</td>
                  <td>{client.contact_name || client.contact_email || '—'}</td>
                  <td>{client.active ? 'Active' : 'Archived'}</td>
                  <td>
                    <button className="btn" onClick={() => setEditing(client)}>
                      {isReadOnly ? 'View' : 'Edit'}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
                    No clients found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <ClientModal
          client={null}
          onClose={() => setShowAdd(false)}
          onSave={async (data) => {
            await api.createClient(data);
            load();
          }}
        />
      )}
      {editing && (
        <ClientModal
          client={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await api.updateClient(editing.id, data);
            load();
          }}
          readOnly={isReadOnly}
        />
      )}
    </div>
  );
}
