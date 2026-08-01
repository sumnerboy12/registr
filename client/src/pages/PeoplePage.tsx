import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Person } from '../types';
import { LOGIN_TYPE_LABELS } from '../types';
import { useAuth } from '../auth/AuthContext';
import PersonModal from '../components/PersonModal';
import ImportModal, { type ImportField } from '../components/ImportModal';
import SetPersonPasswordModal from '../components/SetPersonPasswordModal';
import AppAccessModal from '../components/AppAccessModal';
import { downloadCsv } from '../lib/csv';

const PEOPLE_IMPORT_FIELDS: ImportField[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'person', 'full name', 'employee', 'employee name'] },
  { key: 'email', label: 'Email', required: true, aliases: ['email', 'email address', 'e-mail'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'mobile', 'cell', 'phone number', 'contact number'] },
  { key: 'role', label: 'Role', aliases: ['role', 'default role', 'position', 'title', 'job title'] },
];

export default function PeoplePage() {
  const { user, isReadOnly, isAdmin } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Person | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [settingPasswordFor, setSettingPasswordFor] = useState<Person | null>(null);
  const [managingAccessFor, setManagingAccessFor] = useState<Person | null>(null);

  const load = () => {
    api.getPeople().then((data) => {
      setPeople(data);
      setLoading(false);
      // Keep open modals in sync with reloaded data.
      setEditing((current) => (current ? (data.find((p) => p.id === current.id) ?? current) : current));
      setManagingAccessFor((current) => (current ? (data.find((p) => p.id === current.id) ?? current) : current));
    });
  };

  useEffect(load, []);

  const filtered = people.filter(
    (p) =>
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      (p.email ?? '').toLowerCase().includes(q.toLowerCase()) ||
      (p.role ?? '').toLowerCase().includes(q.toLowerCase())
  );

  const exportCsv = () => {
    downloadCsv(
      'people.csv',
      ['Name', 'Login type', 'Email', 'Username', 'Phone', 'Role', 'Date of birth', 'Employment start date', 'Billable', 'Active', 'Notes'],
      filtered.map((p) => [
        p.name,
        LOGIN_TYPE_LABELS[p.login_type],
        p.email ?? '',
        p.username ?? '',
        p.phone ?? '',
        p.role ?? '',
        p.date_of_birth ?? '',
        p.employment_start_date ?? '',
        p.billable ? 'Yes' : 'No',
        p.active ? 'Yes' : 'No',
        p.notes ?? '',
      ])
    );
  };

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>People</h1>
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
                + Add Person
              </button>
            </>
          )}
        </div>
      </div>

      <input placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280, marginBottom: 12 }} />

      <div className="card">
        {loading ? (
          <div style={{ padding: 20 }}>Loading…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Login type</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((person) => (
                <tr key={person.id} style={{ opacity: person.active ? 1 : 0.5 }}>
                  <td>
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: person.color }} />
                  </td>
                  <td>{person.name}</td>
                  <td>{person.email || '—'}</td>
                  <td>{person.role || '—'}</td>
                  <td>{LOGIN_TYPE_LABELS[person.login_type]}</td>
                  <td>{person.active ? 'Active' : 'Inactive'}</td>
                  <td style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {isAdmin && person.id !== user?.id && person.login_type !== 'none' && (
                      <button className="btn" onClick={() => setManagingAccessFor(person)}>
                        Access
                      </button>
                    )}
                    {isAdmin && person.username && (
                      <button className="btn" onClick={() => setSettingPasswordFor(person)}>
                        {person.has_password ? 'Reset password' : 'Set password'}
                      </button>
                    )}
                    <button className="btn" onClick={() => setEditing(person)}>
                      {isReadOnly ? 'View' : 'Edit'}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
                    No people found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <PersonModal
          person={null}
          onClose={() => setShowAdd(false)}
          onSave={async (data) => {
            await api.createPerson(data);
            load();
          }}
        />
      )}
      {editing && (
        <PersonModal
          person={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await api.updatePerson(editing.id, data);
            load();
          }}
          readOnly={isReadOnly}
        />
      )}
      {showImport && (
        <ImportModal
          title="Import People"
          fields={PEOPLE_IMPORT_FIELDS}
          onClose={() => setShowImport(false)}
          onImportRow={async (values) => {
            await api.createPerson({
              name: values.name,
              login_type: 'none',
              email: values.email,
              phone: values.phone || null,
              role: values.role || null,
            });
          }}
          onDone={load}
        />
      )}
      {settingPasswordFor && (
        <SetPersonPasswordModal
          person={settingPasswordFor}
          onClose={() => setSettingPasswordFor(null)}
          onDone={() => {
            setSettingPasswordFor(null);
            load();
          }}
        />
      )}
      {managingAccessFor && (
        <AppAccessModal person={managingAccessFor} onClose={() => setManagingAccessFor(null)} onChanged={load} />
      )}
    </div>
  );
}
