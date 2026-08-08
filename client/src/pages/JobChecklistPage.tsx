import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { ChecklistStage, Client, Job, JobChecklistItem } from '../types';
import {
  CHECKLIST_ITEM_COMPLETE_STATUSES,
  CHECKLIST_ITEM_STATUSES,
  CHECKLIST_ITEM_STATUS_COLORS,
  CHECKLIST_ITEM_STATUS_LABELS,
  CHECKLIST_STAGES,
  CHECKLIST_STAGE_LABELS,
} from '../types';
import { useAuth } from '../auth/AuthContext';
import JobHeader from '../components/JobHeader';
import ChecklistItemModal from '../components/ChecklistItemModal';
import AddChecklistItemModal from '../components/AddChecklistItemModal';

// Split out of JobDetailPage into its own full-page view — a long checklist
// competes for space with every other job field, assignment and comment on
// that page; this gets the whole viewport instead. Job fields themselves
// still only live on JobDetailPage, reached via the back link below.
export default function JobChecklistPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, isReadOnly } = useAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clientFor = (id: number | null) => (id != null ? clients.find((c) => c.id === id) : undefined);

  const [checklist, setChecklist] = useState<JobChecklistItem[]>([]);
  const [checklistBusy, setChecklistBusy] = useState(false);
  const [showAddChecklistItem, setShowAddChecklistItem] = useState(false);
  // The item currently open in ChecklistItemModal (its full detail view).
  const [checklistOpenItemId, setChecklistOpenItemId] = useState<number | null>(null);
  // A stage a user has manually collapsed, or that auto-collapsed once every
  // item in it was done — see the effect below.
  const [collapsedStages, setCollapsedStages] = useState<Set<ChecklistStage>>(new Set());
  // Tracks each stage's all-done state as of the last render, so the effect
  // below can tell "just became all done" (auto-collapse it) apart from
  // "has been all done the whole time" (leave whatever the user chose).
  const prevStageAllDoneRef = useRef<Partial<Record<ChecklistStage, boolean>>>({});

  useEffect(() => {
    api.getClients({ active: true }).then(setClients);
  }, []);

  useEffect(() => {
    if (!code) return;
    api
      .getJobByCode(code)
      .then((j) => {
        setJob(j);
        return api.getJobChecklist(j.id).then(setChecklist);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [code]);

  useEffect(() => {
    const prev = prevStageAllDoneRef.current;
    const next: Partial<Record<ChecklistStage, boolean>> = {};
    const justCompleted: ChecklistStage[] = [];
    const justReopened: ChecklistStage[] = [];
    for (const stage of CHECKLIST_STAGES) {
      const stageItems = checklist.filter((i) => i.stage === stage);
      const allDone = stageItems.length > 0 && stageItems.every((i) => CHECKLIST_ITEM_COMPLETE_STATUSES.includes(i.status));
      next[stage] = allDone;
      if (allDone && !prev[stage]) justCompleted.push(stage);
      // A stage that was fully done and no longer is (an item reopened, or a
      // new item added to it) surfaces itself again even if it had been
      // auto- or manually collapsed — otherwise new outstanding work could
      // sit hidden behind a stale "all done" collapse.
      if (!allDone && prev[stage]) justReopened.push(stage);
    }
    prevStageAllDoneRef.current = next;
    if (justCompleted.length > 0 || justReopened.length > 0) {
      setCollapsedStages((current) => {
        const updated = new Set(current);
        justCompleted.forEach((s) => updated.add(s));
        justReopened.forEach((s) => updated.delete(s));
        return updated;
      });
    }
  }, [checklist]);

  const toggleStageCollapsed = (stage: ChecklistStage) => {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  // Shared by the row's status-cycle button and ChecklistItemModal (whose
  // status buttons, label edits, and comment/attachment counts all funnel
  // their result back through this to keep the row's own view in sync).
  const updateChecklistItemInList = (updated: JobChecklistItem) => {
    setChecklist((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  };

  // Quick single-click status advance for fast data entry against a long
  // checklist — Open -> In Progress -> Done -> Won't Do -> Open. Opening the
  // item's modal offers the same four statuses as explicit buttons for when
  // reviewing rather than just clicking through.
  const cycleChecklistStatus = async (item: JobChecklistItem) => {
    if (!job) return;
    const nextStatus = CHECKLIST_ITEM_STATUSES[(CHECKLIST_ITEM_STATUSES.indexOf(item.status) + 1) % CHECKLIST_ITEM_STATUSES.length];
    setChecklistBusy(true);
    try {
      updateChecklistItemInList(await api.updateJobChecklistItem(job.id, item.id, { status: nextStatus }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update checklist item');
    } finally {
      setChecklistBusy(false);
    }
  };

  const onChecklistItemAdded = (item: JobChecklistItem) => {
    setChecklist((prev) => [...prev, item]);
  };

  const deleteChecklistItem = async (itemId: number) => {
    if (!job) return;
    if (!confirm('Remove this checklist item from the job?')) return;
    setChecklistBusy(true);
    try {
      await api.deleteJobChecklistItem(job.id, itemId);
      setChecklist((prev) => prev.filter((i) => i.id !== itemId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove checklist item');
    } finally {
      setChecklistBusy(false);
    }
  };

  const syncChecklist = async () => {
    if (!job) return;
    setChecklistBusy(true);
    try {
      setChecklist(await api.syncJobChecklist(job.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to sync checklist');
    } finally {
      setChecklistBusy(false);
    }
  };

  if (loading) return <div style={{ padding: 20 }}>Loading…</div>;
  if (error || !job) return <div style={{ padding: 20, color: 'var(--danger)' }}>{error ?? 'Job not found'}</div>;

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <JobHeader
        job={job}
        client={clientFor(job.client_id)}
        backLabel="Back to job"
        onBack={() => navigate(`/jobs/${job.code}`)}
      />

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ fontSize: 20, margin: 0 }}>
            QA Checklist
            {checklist.length > 0
              ? ` (${checklist.filter((i) => CHECKLIST_ITEM_COMPLETE_STATUSES.includes(i.status)).length}/${checklist.length})`
              : ''}
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => window.open(`/jobs/${job.code}/qa-report`, '_blank')}>
              Export PDF
            </button>
            {!isReadOnly && (
              <>
                <button className="btn" onClick={syncChecklist} disabled={checklistBusy}>
                  Sync template
                </button>
                <button className="btn" onClick={() => setShowAddChecklistItem(true)}>
                  + Add
                </button>
              </>
            )}
          </div>
        </div>

        {checklist.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 12 }}>No checklist items yet.</div>
        ) : (
          CHECKLIST_STAGES.map((stage) => {
            const stageItems = checklist.filter((i) => i.stage === stage).sort((a, b) => a.sequence - b.sequence);
            if (stageItems.length === 0) return null;
            const isCollapsed = collapsedStages.has(stage);
            const doneCount = stageItems.filter((i) => CHECKLIST_ITEM_COMPLETE_STATUSES.includes(i.status)).length;
            return (
              <div key={stage} style={{ marginBottom: 14 }}>
                <button
                  onClick={() => toggleStageCollapsed(stage)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    marginBottom: 6,
                    cursor: 'pointer',
                    font: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 10 }}>{isCollapsed ? '▶' : '▼'}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--text-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {CHECKLIST_STAGE_LABELS[stage]}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    ({doneCount}/{stageItems.length})
                  </span>
                </button>
                {!isCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {stageItems.map((item) => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                        <button
                          onClick={() => cycleChecklistStatus(item)}
                          disabled={isReadOnly || checklistBusy}
                          title="Click to change status"
                          style={{
                            flexShrink: 0,
                            width: 90,
                            padding: '2px 0',
                            fontSize: 11,
                            fontWeight: 600,
                            textAlign: 'center',
                            borderRadius: 4,
                            border: 'none',
                            color: 'white',
                            background: CHECKLIST_ITEM_STATUS_COLORS[item.status],
                            cursor: isReadOnly ? 'default' : 'pointer',
                            opacity: isReadOnly ? 0.85 : 1,
                          }}
                        >
                          {CHECKLIST_ITEM_STATUS_LABELS[item.status]}
                        </button>
                        <button
                          onClick={() => setChecklistOpenItemId(item.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            font: 'inherit',
                            fontSize: 14,
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          {item.label}
                        </button>
                        {item.internal && (
                          <span
                            title="Left out of the customer-facing PDF export"
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.02em',
                              padding: '1px 6px',
                              borderRadius: 999,
                              border: '1px solid var(--border)',
                              color: 'var(--text-dim)',
                            }}
                          >
                            Internal
                          </span>
                        )}
                        {(item.comment_count > 0 || item.attachment_count > 0 || item.notes) && (
                          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                            {item.notes && '📝'}
                            {item.comment_count > 0 && ` 💬${item.comment_count}`}
                            {item.attachment_count > 0 && ` 📎${item.attachment_count}`}
                          </span>
                        )}
                        {!isReadOnly && (
                          <button
                            onClick={() => deleteChecklistItem(item.id)}
                            disabled={checklistBusy}
                            style={{
                              marginLeft: 'auto',
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              fontSize: 11,
                              color: 'var(--danger)',
                              opacity: 0.6,
                              cursor: 'pointer',
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {checklistOpenItemId != null &&
        (() => {
          const openItem = checklist.find((i) => i.id === checklistOpenItemId);
          if (!openItem) return null;
          return (
            <ChecklistItemModal
              jobId={job.id}
              item={openItem}
              isReadOnly={isReadOnly}
              currentUserId={user?.id ?? null}
              onClose={() => setChecklistOpenItemId(null)}
              onItemChange={updateChecklistItemInList}
            />
          );
        })()}

      {showAddChecklistItem && (
        <AddChecklistItemModal jobId={job.id} onClose={() => setShowAddChecklistItem(false)} onAdded={onChecklistItemAdded} />
      )}
    </div>
  );
}
