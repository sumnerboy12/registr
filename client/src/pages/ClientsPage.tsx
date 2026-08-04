import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Client } from '../types';
import { CLIENT_TYPE_LABELS } from '../types';
import { useAuth } from '../auth/AuthContext';
import ClientModal from '../components/ClientModal';
import ImportModal, { type ImportField } from '../components/ImportModal';
import { downloadCsv, labelToKey } from '../lib/csv';

// Covers every field in the Export CSV below, so exporting and re-importing
// the same file round-trips a client exactly — this doubles as backup/restore.
const CLIENT_IMPORT_FIELDS: ImportField[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'client', 'client name', 'company', 'company name'] },
  { key: 'type', label: 'Type', aliases: ['type', 'client type'] },
  { key: 'contact_name', label: 'Contact name', aliases: ['contact', 'contact name', 'contact person'] },
  { key: 'contact_email', label: 'Contact email', aliases: ['email', 'contact email', 'email address', 'e-mail'] },
  { key: 'contact_phone', label: 'Contact phone', aliases: ['phone', 'contact phone', 'mobile', 'phone number'] },
  { key: 'accounts_email', label: 'Accounts email', aliases: ['accounts email', 'accounts', 'payables email'] },
  { key: 'active', label: 'Active', aliases: ['active', 'status'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments'] },
  { key: 'color', label: 'Color', aliases: ['color', 'colour'] },
];

export default function ClientsPage() {
  const { isReadOnly } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const load = () => {
    api.getClients().then((data) => {
      setClients(data);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const filtered = clients.filter((c) => (showInactive || c.active) && c.name.toLowerCase().includes(q.toLowerCase()));

  const exportCsv = () => {
    downloadCsv(
      'clients.csv',
      ['Name', 'Type', 'Contact name', 'Contact email', 'Contact phone', 'Accounts email', 'Active', 'Notes', 'Color'],
      filtered.map((c) => [
        c.name,
        CLIENT_TYPE_LABELS[c.type],
        c.contact_name ?? '',
        c.contact_email ?? '',
        c.contact_phone ?? '',
        c.accounts_email ?? '',
        c.active ? 'Yes' : 'No',
        c.notes ?? '',
        c.color,
      ])
    );
  };

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Clients</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn" onClick={exportCsv}>
            Export
          </button>
          {!isReadOnly && (
            <>
              <button className="btn" onClick={() => setShowImport(true)}>
                Import
              </button>
              <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
                + Add Client
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
        <input placeholder="Search clients…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />
        <label style={{ fontSize: 13, color: 'var(--text-dim)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} style={{ width: 'auto' }} />
          Show inactive
        </label>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 20 }}>Loading…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Type</th>
                <th>Contact</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr key={client.id} style={{ opacity: client.active ? 1 : 0.5 }}>
                  <td>
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: client.color }} />
                  </td>
                  <td>{client.name}</td>
                  <td>{CLIENT_TYPE_LABELS[client.type]}</td>
                  <td>{client.contact_name || client.contact_email || '—'}</td>
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
      {showImport && (
        <ImportModal
          title="Import Clients"
          fields={CLIENT_IMPORT_FIELDS}
          existingKeys={new Set(clients.map((c) => c.name.trim().toLowerCase()))}
          getKey={(values) => values.name.trim().toLowerCase()}
          onClose={() => setShowImport(false)}
          onImportRow={async (values) => {
            const created = await api.createClient({
              name: values.name,
              type: labelToKey(CLIENT_TYPE_LABELS, values.type),
              contact_name: values.contact_name || null,
              contact_email: values.contact_email || null,
              contact_phone: values.contact_phone || null,
              accounts_email: values.accounts_email || null,
              notes: values.notes || null,
              color: values.color || undefined,
            });
            if (values.active.trim().toLowerCase() === 'no') {
              await api.updateClient(created.id, { active: false });
            }
          }}
          onDone={load}
        />
      )}
    </div>
  );
}
