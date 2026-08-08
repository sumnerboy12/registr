import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { ChecklistStage, Client, Job, JobChecklistItem } from '../types';
import {
  CHECKLIST_ITEM_COMPLETE_STATUSES,
  CHECKLIST_ITEM_STATUS_COLORS,
  CHECKLIST_ITEM_STATUS_LABELS,
  CHECKLIST_STAGES,
  CHECKLIST_STAGE_LABELS,
} from '../types';
import { useAuth } from '../auth/AuthContext';
import JobHeader from '../components/JobHeader';
import ChecklistItemModal from '../components/ChecklistItemModal';
import AddChecklistItemModal from '../components/AddChecklistItemModal';
import { downloadQaReportPdf } from '../lib/qaReportPdf';

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
  const [pdfGenerating, setPdfGenerating] = useState(false);
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

  const onChecklistItemAdded = (item: JobChecklistItem) => {
    setChecklist((prev) => [...prev, item]);
  };

  const deleteChecklistItem = async (itemId: number) => {
    if (!job) return;
    if (!confirm('Delete this checklist item from the job?')) return;
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

  const exportPdf = async () => {
    setPdfGenerating(true);
    try {
      await downloadQaReportPdf(job, clientFor(job.client_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate PDF');
    } finally {
      setPdfGenerating(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <JobHeader
        job={job}
        client={clientFor(job.client_id)}
        backLabel="Back to job"
        onBack={() => navigate(`/jobs/${job.code}`)}
      />

      <div className="card" style={{ padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, margin: 0 }}>
            QA Checklist
            {checklist.length > 0
              ? ` (${checklist.filter((i) => CHECKLIST_ITEM_COMPLETE_STATUSES.includes(i.status)).length}/${checklist.length})`
              : ''}
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={exportPdf} disabled={pdfGenerating}>
              {pdfGenerating ? 'Generating PDF…' : 'Export PDF'}
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
              <div key={stage} style={{ marginBottom: 24 }}>
                <button
                  onClick={() => toggleStageCollapsed(stage)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    marginBottom: 10,
                    cursor: 'pointer',
                    font: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', width: 10 }}>{isCollapsed ? '▶' : '▼'}</span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {CHECKLIST_STAGE_LABELS[stage]}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                    ({doneCount}/{stageItems.length})
                  </span>
                </button>
                {!isCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {stageItems.map((item) => (
                      <div
                        key={item.id}
                        className="checklist-item-row"
                        onClick={() => setChecklistOpenItemId(item.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, padding: '5px 10px', borderRadius: 6, cursor: 'pointer' }}
                      >
                        <span
                          style={{
                            flexShrink: 0,
                            width: 108,
                            padding: '5px 0',
                            fontSize: 12,
                            fontWeight: 600,
                            textAlign: 'center',
                            borderRadius: 6,
                            color: 'white',
                            background: CHECKLIST_ITEM_STATUS_COLORS[item.status],
                          }}
                        >
                          {CHECKLIST_ITEM_STATUS_LABELS[item.status]}
                        </span>
                        <span style={{ fontSize: 15 }}>{item.label}</span>
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
                          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                            {item.notes && '🗒️'}
                            {item.comment_count > 0 && ` 💬${item.comment_count}`}
                            {item.attachment_count > 0 && ` 📎${item.attachment_count}`}
                          </span>
                        )}
                        {!isReadOnly && (
                          <button
                            className="btn btn-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteChecklistItem(item.id);
                            }}
                            disabled={checklistBusy}
                            style={{ marginLeft: 'auto', padding: '4px 8px', fontSize: 12 }}
                          >
                            Delete
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
