import { useState } from 'react';
import type { ChecklistStage, JobChecklistItem } from '../types';
import { CHECKLIST_STAGES, CHECKLIST_STAGE_LABELS } from '../types';
import { api } from '../api/client';

interface Props {
  jobId: string;
  onClose: () => void;
  onAdded: (item: JobChecklistItem) => void;
}

export default function AddChecklistItemModal({ jobId, onClose, onAdded }: Props) {
  const [stage, setStage] = useState<ChecklistStage>('pre_start');
  const [label, setLabel] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!label.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.addJobChecklistItem(jobId, { stage, label: label.trim(), internal });
      onAdded(created);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add checklist item');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add Checklist Item</h2>

        <div className="field">
          <label>Stage</label>
          <select value={stage} onChange={(e) => setStage(e.target.value as ChecklistStage)} autoFocus>
            {CHECKLIST_STAGES.map((s) => (
              <option key={s} value={s}>
                {CHECKLIST_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Item</label>
          <input
            placeholder="Checklist item…"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={internal} onChange={(e) => setInternal(e.target.checked)} />
            Internal (left out of the customer-facing PDF export)
          </label>
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{error}</div>}

        <div className="modal-actions">
          <div />
          <div className="right">
            <button className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleAdd} disabled={busy || !label.trim()}>
              {busy ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
