import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Person } from '../types';
import { APP_LABELS } from '../types';
import { useAuth } from '../auth/AuthContext';
import PersonModal from '../components/PersonModal';

export default function PeoplePage() {
  const { isReadOnly } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Person | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = () => {
    api.getPeople().then((data) => {
      setPeople(data);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const filtered = people.filter(
    (p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.email.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>People</h1>
        {!isReadOnly && (
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            + Add Person
          </button>
        )}
      </div>

      <input placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280, marginBottom: 12 }} />

      <div className="card">
        {loading ? (
          <div style={{ padding: 20 }}>Loading…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>App access</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((person) => (
                <tr key={person.id}>
                  <td>{person.name}</td>
                  <td>{person.email}</td>
                  <td>{person.role_default || '—'}</td>
                  <td>
                    {person.app_access.length === 0
                      ? '—'
                      : person.app_access.map((a) => (
                          <span key={a.app} className="badge" style={{ marginRight: 6 }}>
                            {APP_LABELS[a.app]}: {a.role}
                          </span>
                        ))}
                  </td>
                  <td>{person.active ? 'Active' : 'Archived'}</td>
                  <td>
                    <button className="btn" onClick={() => setEditing(person)}>
                      {isReadOnly ? 'View' : 'Edit'}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
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
          onAccessChanged={load}
          readOnly={isReadOnly}
        />
      )}
    </div>
  );
}
