import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Plant } from '../types';
import { useAuth } from '../auth/AuthContext';
import PlantModal from '../components/PlantModal';
import ImportModal, { type ImportField } from '../components/ImportModal';
import { downloadCsv } from '../lib/csv';

// Covers every field in the Export CSV below, so exporting and re-importing
// the same file round-trips a plant item exactly — this doubles as backup/restore.
const PLANT_IMPORT_FIELDS: ImportField[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'plant', 'equipment', 'description', 'asset', 'asset name'] },
  { key: 'rego', label: 'Rego', aliases: ['rego', 'registration', 'rego number', 'plate'] },
  { key: 'active', label: 'Active', aliases: ['active', 'status'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments'] },
  { key: 'color', label: 'Color', aliases: ['color', 'colour'] },
];

export default function PlantPage() {
  const { isReadOnly, isAdmin } = useAuth();
  const [plant, setPlant] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Plant | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const load = () => {
    api.getPlant().then((data) => {
      setPlant(data);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const filtered = plant.filter((p) => (showInactive || p.active) && p.name.toLowerCase().includes(q.toLowerCase()));

  const exportCsv = () => {
    downloadCsv(
      'plant.csv',
      ['Name', 'Rego', 'Active', 'Notes', 'Color'],
      filtered.map((p) => [p.name, p.rego ?? '', p.active ? 'Yes' : 'No', p.notes ?? '', p.color])
    );
  };

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Plant</h1>
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
              + Add Plant
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
        <input placeholder="Search plant…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />
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
                <th>Rego</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                  <td>
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: p.color }} />
                  </td>
                  <td>{p.name}</td>
                  <td>{p.rego || '—'}</td>
                  <td>
                    <button className="btn" onClick={() => setEditing(p)}>
                      {isReadOnly ? 'View' : 'Edit'}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
                    No plant found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <PlantModal
          plant={null}
          onClose={() => setShowAdd(false)}
          onSave={async (data) => {
            await api.createPlant(data);
            load();
          }}
        />
      )}
      {editing && (
        <PlantModal
          plant={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await api.updatePlant(editing.id, data);
            load();
          }}
          readOnly={isReadOnly}
        />
      )}
      {showImport && (
        <ImportModal
          title="Import Plant"
          fields={PLANT_IMPORT_FIELDS}
          existingKeys={new Set(plant.map((p) => p.name.trim().toLowerCase()))}
          getKey={(values) => values.name.trim().toLowerCase()}
          onClose={() => setShowImport(false)}
          onImportRow={async (values) => {
            const created = await api.createPlant({
              name: values.name,
              rego: values.rego || null,
              notes: values.notes || null,
              color: values.color || undefined,
            });
            if (values.active.trim().toLowerCase() === 'no') {
              await api.updatePlant(created.id, { active: false });
            }
          }}
          onDone={load}
        />
      )}
    </div>
  );
}
