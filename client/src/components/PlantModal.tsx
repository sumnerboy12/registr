import { useState } from 'react';
import type { Plant } from '../types';
import { SWATCH_COLORS } from '../lib/colors';
import ColorSwatchPicker from './ColorSwatchPicker';

interface Props {
  plant: Plant | null;
  onClose: () => void;
  onSave: (data: Partial<Plant>) => Promise<void>;
  readOnly?: boolean;
}

export default function PlantModal({ plant, onClose, onSave, readOnly }: Props) {
  const [name, setName] = useState(plant?.name ?? '');
  const [rego, setRego] = useState(plant?.rego ?? '');
  const [active, setActive] = useState(plant?.active ?? true);
  const [color, setColor] = useState(plant?.color ?? SWATCH_COLORS[6]);
  const [notes, setNotes] = useState(plant?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Plant name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name,
        rego: rego || null,
        active,
        color,
        notes,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{plant ? (readOnly ? 'View Plant' : 'Edit Plant') : 'New Plant'}</h2>

        <div className="row">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus disabled={readOnly} />
          </div>
          <div className="field">
            <label>Rego</label>
            <input value={rego ?? ''} onChange={(e) => setRego(e.target.value)} disabled={readOnly} />
          </div>
        </div>

        <div className="field">
          <label>Colour</label>
          <ColorSwatchPicker value={color} onChange={setColor} disabled={readOnly} />
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea rows={3} value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} />
        </div>

        {plant && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 12 }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={readOnly} />
            Active
          </label>
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
