import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api/client';
import type { ChecklistStage, ChecklistTemplateItem, JobType } from '../types';
import { CHECKLIST_STAGES, CHECKLIST_STAGE_LABELS, JOB_TYPE_LABELS } from '../types';
import { useAuth } from '../auth/AuthContext';

const JOB_TYPE_OPTIONS: (JobType | 'all')[] = ['all', 'contract', 'minor_works', 'remedial'];

export default function ChecklistTemplatesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ChecklistTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 'all' shows every item regardless of job type; a specific job type
  // filters to items that would actually apply to that kind of job (its own
  // job_type, plus the job_type IS NULL "every type" items).
  const [filterJobType, setFilterJobType] = useState<JobType | 'all'>('all');
  const [newLabel, setNewLabel] = useState<Record<ChecklistStage, string>>({
    pre_start: '',
    in_progress: '',
    completion: '',
    warranty: '',
  });
  const [newJobType, setNewJobType] = useState<Record<ChecklistStage, JobType | ''>>({
    pre_start: '',
    in_progress: '',
    completion: '',
    warranty: '',
  });
  const [newInternal, setNewInternal] = useState<Record<ChecklistStage, boolean>>({
    pre_start: false,
    in_progress: false,
    completion: false,
    warranty: false,
  });

  const load = () => {
    setLoading(true);
    api
      .getChecklistTemplates()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (user?.role !== 'admin') return <Navigate to="/" replace />;

  // Sorting/moving always operates on every item in the stage (not just the
  // filtered view) so sequence numbers stay consistent regardless of which
  // job-type filter happens to be selected.
  const itemsByStage = (stage: ChecklistStage) =>
    items
      .filter((i) => i.stage === stage)
      .filter((i) => filterJobType === 'all' || i.job_type === filterJobType || i.job_type == null)
      .sort((a, b) => a.sequence - b.sequence);

  const patchItem = async (
    id: number,
    data: Partial<Pick<ChecklistTemplateItem, 'label' | 'active' | 'sequence' | 'job_type' | 'internal'>>
  ) => {
    setError(null);
    try {
      const updated = await api.updateChecklistTemplateItem(id, data);
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    }
  };

  const swap = async (stage: ChecklistStage, index: number, direction: -1 | 1) => {
    const stageItems = itemsByStage(stage);
    const other = stageItems[index + direction];
    const current = stageItems[index];
    if (!other) return;
    await Promise.all([
      patchItem(current.id, { sequence: other.sequence }),
      patchItem(other.id, { sequence: current.sequence }),
    ]);
  };

  const addItem = async (stage: ChecklistStage) => {
    const label = newLabel[stage].trim();
    if (!label) return;
    setError(null);
    try {
      const created = await api.createChecklistTemplateItem({
        stage,
        label,
        job_type: newJobType[stage] || null,
        internal: newInternal[stage],
      });
      setItems((prev) => [...prev, created]);
      setNewLabel((prev) => ({ ...prev, [stage]: '' }));
      setNewJobType((prev) => ({ ...prev, [stage]: '' }));
      setNewInternal((prev) => ({ ...prev, [stage]: false }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add item');
    }
  };

  const deleteItem = async (id: number) => {
    if (!confirm("Delete this checklist item? Jobs that already copied it keep their own copy — this only removes it from the template.")) return;
    setError(null);
    try {
      await api.deleteChecklistTemplateItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, margin: '0 0 16px' }}>QA Checklist Template</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>
        The master list of QA tasks copied onto every new job's own checklist. Each item can be scoped to one job
        type or left as "All job types" to apply to Contract, Minor Works and Remedial jobs alike. Editing this
        doesn't change any existing job's already-recorded checklist — use "Sync checklist" on a job to pull in items
        added here after it was created.
      </p>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {JOB_TYPE_OPTIONS.map((jt) => (
          <button
            key={jt}
            className="btn"
            style={{
              fontSize: 12,
              background: filterJobType === jt ? 'var(--nav-accent)' : undefined,
              color: filterJobType === jt ? 'white' : undefined,
            }}
            onClick={() => setFilterJobType(jt)}
          >
            {jt === 'all' ? 'All Job Types' : JOB_TYPE_LABELS[jt]}
          </button>
        ))}
      </div>
      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div className="card" style={{ padding: 20 }}>
          Loading…
        </div>
      ) : (
        CHECKLIST_STAGES.map((stage) => {
          const stageItems = itemsByStage(stage);
          return (
            <div key={stage} className="card" style={{ padding: 20, marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, marginTop: 0 }}>{CHECKLIST_STAGE_LABELS[stage]}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {stageItems.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No items yet.</div>}
                {stageItems.map((item, index) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <button
                        className="btn"
                        style={{ padding: '0 6px', fontSize: 10, lineHeight: '16px' }}
                        onClick={() => swap(stage, index, -1)}
                        disabled={index === 0}
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        className="btn"
                        style={{ padding: '0 6px', fontSize: 10, lineHeight: '16px' }}
                        onClick={() => swap(stage, index, 1)}
                        disabled={index === stageItems.length - 1}
                        title="Move down"
                      >
                        ▼
                      </button>
                    </div>
                    <input
                      defaultValue={item.label}
                      onBlur={(e) => {
                        const label = e.target.value.trim();
                        if (label && label !== item.label) patchItem(item.id, { label });
                      }}
                      style={{ flex: 1 }}
                    />
                    <select
                      value={item.job_type ?? ''}
                      onChange={(e) => patchItem(item.id, { job_type: (e.target.value || null) as ChecklistTemplateItem['job_type'] })}
                      style={{ fontSize: 12, width: 150 }}
                      title="Job type"
                    >
                      <option value="">All job types</option>
                      <option value="contract">{JOB_TYPE_LABELS.contract}</option>
                      <option value="minor_works">{JOB_TYPE_LABELS.minor_works}</option>
                      <option value="remedial">{JOB_TYPE_LABELS.remedial}</option>
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-dim)' }}>
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        checked={item.active}
                        onChange={(e) => patchItem(item.id, { active: e.target.checked })}
                      />
                      Active
                    </label>
                    <label
                      title="Left out of the customer-facing PDF export — still shown everywhere else"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-dim)' }}
                    >
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        checked={item.internal}
                        onChange={(e) => patchItem(item.id, { internal: e.target.checked })}
                      />
                      Internal
                    </label>
                    <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => deleteItem(item.id)}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  placeholder="New checklist item…"
                  value={newLabel[stage]}
                  onChange={(e) => setNewLabel((prev) => ({ ...prev, [stage]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addItem(stage)}
                  style={{ flex: 1 }}
                />
                <select
                  value={newJobType[stage]}
                  onChange={(e) => setNewJobType((prev) => ({ ...prev, [stage]: e.target.value as JobType | '' }))}
                  style={{ fontSize: 12, width: 150 }}
                  title="Job type"
                >
                  <option value="">All job types</option>
                  <option value="contract">{JOB_TYPE_LABELS.contract}</option>
                  <option value="minor_works">{JOB_TYPE_LABELS.minor_works}</option>
                  <option value="remedial">{JOB_TYPE_LABELS.remedial}</option>
                </select>
                <label
                  title="Left out of the customer-facing PDF export — still shown everywhere else"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-dim)' }}
                >
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={newInternal[stage]}
                    onChange={(e) => setNewInternal((prev) => ({ ...prev, [stage]: e.target.checked }))}
                  />
                  Internal
                </label>
                <button className="btn" onClick={() => addItem(stage)} disabled={!newLabel[stage].trim()}>
                  Add
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
