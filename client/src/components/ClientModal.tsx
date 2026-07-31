import { useState } from 'react';
import type { Client, ClientType } from '../types';
import { CLIENT_TYPE_LABELS } from '../types';

interface Props {
  client: Client | null;
  onClose: () => void;
  onSave: (data: Partial<Client>) => Promise<void>;
  readOnly?: boolean;
}

const TYPES = Object.keys(CLIENT_TYPE_LABELS) as ClientType[];

export default function ClientModal({ client, onClose, onSave, readOnly }: Props) {
  const [name, setName] = useState(client?.name ?? '');
  const [type, setType] = useState<ClientType>(client?.type ?? 'direct');
  const [contactName, setContactName] = useState(client?.contact_name ?? '');
  const [contactEmail, setContactEmail] = useState(client?.contact_email ?? '');
  const [contactPhone, setContactPhone] = useState(client?.contact_phone ?? '');
  const [accountsEmail, setAccountsEmail] = useState(client?.accounts_email ?? '');
  const [active, setActive] = useState(client?.active ?? true);
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Client name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name,
        type,
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
        accounts_email: accountsEmail || null,
        active,
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
        <h2>{client ? (readOnly ? 'View Client' : 'Edit Client') : 'New Client'}</h2>

        <div className="row">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus disabled={readOnly} />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as ClientType)} disabled={readOnly}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {CLIENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Contact name</label>
            <input value={contactName ?? ''} onChange={(e) => setContactName(e.target.value)} disabled={readOnly} />
          </div>
          <div className="field">
            <label>Contact phone</label>
            <input value={contactPhone ?? ''} onChange={(e) => setContactPhone(e.target.value)} disabled={readOnly} />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Contact email</label>
            <input value={contactEmail ?? ''} onChange={(e) => setContactEmail(e.target.value)} disabled={readOnly} />
          </div>
          <div className="field">
            <label>Accounts / payables email</label>
            <input value={accountsEmail ?? ''} onChange={(e) => setAccountsEmail(e.target.value)} disabled={readOnly} />
          </div>
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea rows={3} value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} />
        </div>

        {client && (
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
