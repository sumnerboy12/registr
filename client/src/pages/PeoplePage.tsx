import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { EmploymentType, Person } from '../types';
import { EMPLOYMENT_TYPE_LABELS, LOGIN_TYPE_LABELS } from '../types';
import { useAuth } from '../auth/AuthContext';
import PersonModal from '../components/PersonModal';
import ImportModal, { type ImportField } from '../components/ImportModal';
import AppAccessModal from '../components/AppAccessModal';
import ThinkSafeBadge from '../components/ThinkSafeBadge';
import { downloadCsv, labelToKey } from '../lib/csv';

// Covers every field in the Export CSV below, so exporting and re-importing
// the same file round-trips a person exactly — this doubles as backup/restore.
const PEOPLE_IMPORT_FIELDS: ImportField[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'person', 'full name', 'employee', 'employee name'] },
  { key: 'login_type', label: 'Login type', aliases: ['login type', 'login', 'sign-in'] },
  { key: 'email', label: 'Email', required: true, aliases: ['email', 'email address', 'e-mail'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'mobile', 'cell', 'phone number', 'contact number'] },
  { key: 'role', label: 'Role', aliases: ['role', 'default role', 'position', 'title', 'job title'] },
  { key: 'date_of_birth', label: 'Date of birth', aliases: ['date of birth', 'dob', 'birth date'] },
  { key: 'employment_start_date', label: 'Employment start date', aliases: ['employment start date', 'start date'] },
  { key: 'employment_end_date', label: 'Employment end date', aliases: ['employment end date', 'end date'] },
  { key: 'employment_type', label: 'Employment type', aliases: ['employment type'] },
  { key: 'active', label: 'Active', aliases: ['active', 'status'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments'] },
  { key: 'color', label: 'Color', aliases: ['color', 'colour'] },
];

export default function PeoplePage() {
  const { isReadOnly, isAdmin } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [employmentType, setEmploymentType] = useState<EmploymentType | ''>('');
  const [editing, setEditing] = useState<Person | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
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
      (showInactive || p.active) &&
      (!employmentType || p.employment_type === employmentType) &&
      (p.name.toLowerCase().includes(q.toLowerCase()) ||
        (p.email ?? '').toLowerCase().includes(q.toLowerCase()) ||
        (p.role ?? '').toLowerCase().includes(q.toLowerCase()))
  );

  const exportCsv = () => {
    downloadCsv(
      'people.csv',
      [
        'Name',
        'Login type',
        'Email',
        'Phone',
        'Role',
        'Date of birth',
        'Employment start date',
        'Employment end date',
        'Employment type',
        'Active',
        'Notes',
        'Color',
      ],
      filtered.map((p) => [
        p.name,
        LOGIN_TYPE_LABELS[p.login_type],
        p.email ?? '',
        p.phone ?? '',
        p.role ?? '',
        p.date_of_birth ?? '',
        p.employment_start_date ?? '',
        p.employment_end_date ?? '',
        EMPLOYMENT_TYPE_LABELS[p.employment_type],
        p.active ? 'Yes' : 'No',
        p.notes ?? '',
        p.color,
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
          {isAdmin && (
            <button className="btn" onClick={() => setShowImport(true)}>
              Import
            </button>
          )}
          {!isReadOnly && (
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
              + Add Person
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
        <input placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />
        <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value as EmploymentType | '')}>
          <option value="">All employment types</option>
          {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
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
                <th>Email</th>
                <th>Role</th>
                <th>Type</th>
                <th>Login type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((person) => (
                <tr key={person.id} style={{ opacity: person.active ? 1 : 0.5 }}>
                  <td>
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: person.color }} />
                  </td>
                  <td>
                    {person.name}
                    {person.thinksafe_user && (
                      <>
                        {' '}
                        <ThinkSafeBadge title="Registered on ThinkSafe" />
                      </>
                    )}
                  </td>
                  <td>{person.email || '—'}</td>
                  <td>{person.role || '—'}</td>
                  <td>{EMPLOYMENT_TYPE_LABELS[person.employment_type]}</td>
                  <td>{LOGIN_TYPE_LABELS[person.login_type]}</td>
                  <td style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {isAdmin && person.login_type === 'sso' && (
                      <button className="btn" onClick={() => setManagingAccessFor(person)}>
                        Access
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
          existingKeys={new Set(people.filter((p) => p.email).map((p) => p.email!.trim().toLowerCase()))}
          getKey={(values) => values.email.trim().toLowerCase()}
          onClose={() => setShowImport(false)}
          onImportRow={async (values) => {
            // Not mapped (or unrecognised) falls back to the plain-onboarding
            // defaults this import used before it also had to double as
            // restore: 'none' login, active, server-default employment type.
            const created = await api.createPerson({
              name: values.name,
              login_type: labelToKey(LOGIN_TYPE_LABELS, values.login_type) ?? 'none',
              email: values.email,
              phone: values.phone || null,
              role: values.role || null,
              date_of_birth: values.date_of_birth || null,
              employment_start_date: values.employment_start_date || null,
              employment_end_date: values.employment_end_date || null,
              employment_type: labelToKey(EMPLOYMENT_TYPE_LABELS, values.employment_type),
              notes: values.notes || null,
              color: values.color || undefined,
            });
            if (values.active.trim().toLowerCase() === 'no') {
              await api.updatePerson(created.id, { active: false });
            }
          }}
          onDone={load}
        />
      )}
      {managingAccessFor && (
        <AppAccessModal person={managingAccessFor} onClose={() => setManagingAccessFor(null)} onChanged={load} />
      )}
    </div>
  );
}
