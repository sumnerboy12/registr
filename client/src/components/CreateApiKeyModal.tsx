import { useState } from 'react';
import type { ConsumingApp } from '../types';
import { APP_LABELS } from '../types';
import { api } from '../api/client';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

const APPS: ConsumingApp[] = ['rostr', 'claimr', 'costr'];

export default function CreateApiKeyModal({ onClose, onCreated }: Props) {
  const [app, setApp] = useState<ConsumingApp>('rostr');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await api.createApiKey(app, label);
      setCreatedKey(result.key);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create key');
    } finally {
      setSaving(false);
    }
  };

  const copyKey = () => {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey).then(() => setCopied(true));
  };

  return (
    <div className="modal-backdrop" onClick={createdKey ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {createdKey ? (
          <>
            <h2>API key created</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: -8 }}>
              This is shown once — store it in {APP_LABELS[app]}'s server config now. You won't be able to see it again.
            </p>
            <div className="field">
              <textarea readOnly rows={2} value={createdKey} style={{ fontFamily: 'monospace', fontSize: 13 }} onClick={(e) => e.currentTarget.select()} />
            </div>
            <button className="btn" onClick={copyKey}>
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>
            <div className="modal-actions">
              <div />
              <div className="right">
                <button className="btn btn-primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <h2>Generate API key</h2>
            <div className="field">
              <label>App</label>
              <select value={app} onChange={(e) => setApp(e.target.value as ConsumingApp)}>
                {APPS.map((a) => (
                  <option key={a} value={a}>
                    {APP_LABELS[a]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Label (optional)</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. production" autoFocus />
            </div>
            {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
            <div className="modal-actions">
              <div />
              <div className="right">
                <button className="btn" onClick={onClose}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                  {saving ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
