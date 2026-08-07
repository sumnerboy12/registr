import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type {
  ChecklistStage,
  Client,
  Person,
  Job,
  JobAttachment,
  JobChecklistItem,
  JobComment,
  JobStatus,
  JobType,
} from '../types';
import {
  ASSIGNMENT_ROLE_LABELS,
  CHECKLIST_ITEM_COMPLETE_STATUSES,
  CHECKLIST_ITEM_STATUSES,
  CHECKLIST_ITEM_STATUS_COLORS,
  CHECKLIST_ITEM_STATUS_LABELS,
  CHECKLIST_STAGES,
  CHECKLIST_STAGE_LABELS,
  CONTRACT_ONLY_STATUSES,
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
} from '../types';
import { useAuth } from '../auth/AuthContext';
import ThinkSafeBadge from '../components/ThinkSafeBadge';
import AddAssignmentModal from '../components/AddAssignmentModal';
import ChecklistItemModal from '../components/ChecklistItemModal';
import AddChecklistItemModal from '../components/AddChecklistItemModal';
import { formatDateTime, formatRelativeTime, formatFileSize } from '../lib/formatDate';

// jobValue state stays a plain unformatted numeric string ("1234.5") — this
// only affects how it's displayed while editing. A native number input
// can't show thousand separators (browsers strip them), so Value is a text
// input instead, formatted with commas here and re-parsed back to raw
// digits on every keystroke (see handleValueChange below).
function formatCurrencyInput(raw: string): string {
  if (!raw) return '';
  const [intPart, decPart] = raw.split('.');
  const formattedInt = intPart === '' ? '' : Number(intPart).toLocaleString('en-US');
  return decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
}

export default function JobDetailPage() {
  const { code: codeParam } = useParams();
  const isNew = codeParam === undefined;
  const navigate = useNavigate();
  const { user, isReadOnly, isAdmin } = useAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(!isNew);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState<number | ''>('');
  const [clientName, setClientName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [jobType, setJobType] = useState<JobType>('contract');
  const [status, setStatus] = useState<JobStatus>('tendering');
  const [siteAddress, setSiteAddress] = useState('');
  const [jobValue, setJobValue] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [showAddAssignment, setShowAddAssignment] = useState(false);

  const [comments, setComments] = useState<JobComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentBody, setEditCommentBody] = useState('');

  const [attachments, setAttachments] = useState<JobAttachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const [checklist, setChecklist] = useState<JobChecklistItem[]>([]);
  const [checklistBusy, setChecklistBusy] = useState(false);
  const [showAddChecklistItem, setShowAddChecklistItem] = useState(false);
  // The item currently open in ChecklistItemModal (its full detail view:
  // status, note, comments, attachments) — null when no modal is open.
  const [checklistOpenItemId, setChecklistOpenItemId] = useState<number | null>(null);
  // Manual collapse state — a stage toggled here stays that way regardless
  // of completion. Separate from the auto-collapse-on-all-done effect below
  // so a user re-opening a finished stage to review it doesn't get fought.
  const [collapsedStages, setCollapsedStages] = useState<Set<ChecklistStage>>(new Set());
  // Tracks each stage's all-done state as of the last render, so the effect
  // below can tell "just became all done" (auto-collapse it) apart from
  // "has been all done the whole time" (leave whatever the user chose).
  const prevStageAllDoneRef = useRef<Partial<Record<ChecklistStage, boolean>>>({});

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

  useEffect(() => {
    api.getClients({ active: true }).then(setClients);
    api.getPeople({ active: true }).then(setPeople);
  }, []);

  // Prefills (and keeps refreshing, if Type changes) a suggested code for a
  // new job — non-admins can't override it, so this is the only way they get
  // one at all. Re-fetches on every jobType change rather than reusing a
  // stale suggestion, since switching type changes which sequence applies.
  useEffect(() => {
    if (!isNew) return;
    api.getNextJobCode(jobType).then((r) => setCode(r.code));
  }, [isNew, jobType]);

  // If Type switches away from Contract while a retentions-scheme status is
  // set, that status no longer applies — fall back to Tendering rather than
  // silently submitting an invalid combination. Persisted immediately too
  // (not just the local field), same as any other edit on an existing job.
  useEffect(() => {
    if (jobType !== 'contract' && CONTRACT_ONLY_STATUSES.includes(status)) {
      setStatus('tendering');
      if (!isNew && job) patchField({ status: 'tendering' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobType, status]);

  // Populates every editable field from a loaded job.
  const applyJobToForm = (j: Job) => {
    setCode(j.code);
    setName(j.name);
    setClientId(j.client_id ?? '');
    setClientName(j.client_name ?? '');
    setContactName(j.contact_name ?? '');
    setContactEmail(j.contact_email ?? '');
    setJobType(j.job_type);
    setStatus(j.status);
    setSiteAddress(j.site_address ?? '');
    setJobValue(j.value != null ? String(j.value) : '');
    setNotes(j.notes ?? '');
  };

  useEffect(() => {
    if (isNew) return;
    api.getJobByCode(codeParam).then((j) => {
      setJob(j);
      applyJobToForm(j);
      setLoading(false);
      api.getJobComments(j.id).then(setComments);
      api.getJobAttachments(j.id).then(setAttachments);
      api.getJobChecklist(j.id).then(setChecklist);
    });
  }, [codeParam, isNew]);

  const handleBackToJobs = () => navigate('/');

  const handleCreate = async () => {
    if (!code.trim()) return setError('Job code is required');
    if (!name.trim()) return setError('Job name is required');
    setSaving(true);
    setError(null);
    try {
      await api.createJob({
        code,
        name,
        client_id: clientId === '' ? null : clientId,
        client_name: clientId === '' ? clientName || null : null,
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        job_type: jobType,
        status,
        site_address: siteAddress || null,
        value: jobValue === '' ? null : Number(jobValue),
        notes: notes || null,
      });
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      setSaving(false);
    }
  };

  // Every field on an existing job saves itself the moment it changes —
  // there's no separate Save step (see handleCreate above for the one case
  // that still needs one: a job that doesn't exist yet to patch).
  const patchField = async (partial: Partial<Job>) => {
    if (!job) return;
    setError(null);
    try {
      const updated = await api.updateJob(job.id, partial);
      setJob(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    }
  };

  const reloadAssignments = () => {
    if (!job) return;
    api.getJob(job.id).then(setJob);
  };

  const removeAssignment = async (assignmentId: number) => {
    if (!job) return;
    setAssignmentBusy(true);
    try {
      await api.removeAssignment(job.id, assignmentId);
      const refreshed = await api.getJob(job.id);
      setJob(refreshed);
    } finally {
      setAssignmentBusy(false);
    }
  };

  const postComment = async () => {
    if (!job || !newComment.trim()) return;
    setCommentBusy(true);
    try {
      const comment = await api.addJobComment(job.id, newComment.trim());
      // Most-recent-first, so a new comment goes at the top, matching the
      // server's own ordering.
      setComments((prev) => [comment, ...prev]);
      setNewComment('');
      commentInputRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post comment');
    } finally {
      setCommentBusy(false);
    }
  };

  const startEditComment = (comment: JobComment) => {
    setEditingCommentId(comment.id);
    setEditCommentBody(comment.body);
  };

  const saveEditComment = async () => {
    if (!job || editingCommentId == null || !editCommentBody.trim()) return;
    setCommentBusy(true);
    try {
      const updated = await api.updateJobComment(job.id, editingCommentId, editCommentBody.trim());
      setComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditingCommentId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update comment');
    } finally {
      setCommentBusy(false);
    }
  };

  const deleteComment = async (commentId: number) => {
    if (!job) return;
    if (!confirm('Delete this comment? This can\'t be undone.')) return;
    setCommentBusy(true);
    try {
      await api.deleteJobComment(job.id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete comment');
    } finally {
      setCommentBusy(false);
    }
  };

  const uploadAttachment = async (file: File) => {
    if (!job) return;
    setAttachmentBusy(true);
    try {
      const attachment = await api.uploadJobAttachment(job.id, file);
      setAttachments((prev) => [attachment, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload attachment');
    } finally {
      setAttachmentBusy(false);
    }
  };

  const deleteAttachment = async (attachmentId: number) => {
    if (!job) return;
    if (!confirm('Delete this attachment? This can\'t be undone.')) return;
    setAttachmentBusy(true);
    try {
      await api.deleteJobAttachment(job.id, attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete attachment');
    } finally {
      setAttachmentBusy(false);
    }
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

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{isNew ? 'New Job' : job && `${job.code} - ${job.name}`}</span>
          {job?.thinksafe_site && <ThinkSafeBadge title="Site configured on ThinkSafe" />}
        </h1>
        <button className="btn" onClick={handleBackToJobs}>
          Back to jobs
        </button>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div className="row">
          <div className="field">
            <label>Type</label>
            <select
              value={jobType}
              onChange={(e) => {
                const next = e.target.value as JobType;
                setJobType(next);
                if (!isNew) patchField({ job_type: next });
              }}
              disabled={isReadOnly}
            >
              {Object.entries(JOB_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} disabled={isReadOnly || !isNew || !isAdmin} />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (isNew) return;
                if (!name.trim()) return setError('Job name is required');
                patchField({ name: name.trim() });
              }}
              disabled={isReadOnly}
            />
          </div>
          <div className="field">
            <label>Client</label>
            <select
              value={clientId}
              onChange={(e) => {
                const next = e.target.value ? Number(e.target.value) : '';
                setClientId(next);
                if (!isNew) patchField({ client_id: next === '' ? null : next });
              }}
              disabled={isReadOnly}
            >
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {clientId === '' && (
          <div className="field">
            <label>Client name (not in the list above)</label>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              onBlur={() => {
                if (!isNew) patchField({ client_name: clientName || null });
              }}
              disabled={isReadOnly}
            />
          </div>
        )}

        <div className="row">
          <div className="field">
            <label>Contact name</label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              onBlur={() => {
                if (!isNew) patchField({ contact_name: contactName || null });
              }}
              disabled={isReadOnly}
            />
          </div>
          <div className="field">
            <label>Contact email</label>
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              onBlur={() => {
                if (!isNew) patchField({ contact_email: contactEmail || null });
              }}
              disabled={isReadOnly}
            />
          </div>
        </div>

        <div className="field">
          <label>Site address</label>
          <input
            value={siteAddress}
            onChange={(e) => setSiteAddress(e.target.value)}
            onBlur={() => {
              if (!isNew) patchField({ site_address: siteAddress || null });
            }}
            disabled={isReadOnly}
          />
        </div>

        <div className="row">
          <div className="field">
            <label>Status</label>
            <select
              value={status}
              onChange={(e) => {
                const next = e.target.value as JobStatus;
                setStatus(next);
                if (!isNew) patchField({ status: next });
              }}
              disabled={isReadOnly}
            >
              {Object.entries(JOB_STATUS_LABELS)
                .filter(([value]) => jobType === 'contract' || !CONTRACT_ONLY_STATUSES.includes(value as JobStatus))
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          </div>
          {/* Remedial work is billed differently (not a fixed contract sum),
              so Value doesn't apply — hidden rather than just left blank. */}
          {jobType === 'remedial' ? (
            <div className="field" />
          ) : (
            <div className="field">
              <label>Value</label>
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-dim)',
                    pointerEvents: 'none',
                  }}
                >
                  $
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={formatCurrencyInput(jobValue)}
                  onChange={(e) => {
                    // Keep only digits and a single decimal point.
                    let cleaned = e.target.value.replace(/[^0-9.]/g, '');
                    const firstDot = cleaned.indexOf('.');
                    if (firstDot !== -1) {
                      cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
                    }
                    setJobValue(cleaned);
                  }}
                  onBlur={() => {
                    if (!isNew) patchField({ value: jobValue === '' ? null : Number(jobValue) });
                  }}
                  disabled={isReadOnly}
                  style={{ paddingLeft: 20, width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (!isNew) patchField({ notes: notes || null });
            }}
            disabled={isReadOnly}
          />
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            {!isNew &&
              job &&
              (job.assignments ?? []).map((a) => (
                <span
                  key={a.id}
                  className="badge"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 13 }}
                >
                  {a.person.email ? (
                    <a href={`mailto:${a.person.email}`} title={`Email ${a.person.name}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {ASSIGNMENT_ROLE_LABELS[a.role]}: {a.person.name}
                    </a>
                  ) : (
                    <span>
                      {ASSIGNMENT_ROLE_LABELS[a.role]}: {a.person.name}
                    </span>
                  )}
                  {!isReadOnly && (
                    <button
                      onClick={() => removeAssignment(a.id)}
                      disabled={assignmentBusy}
                      title="Remove assignment"
                      style={{ background: 'none', border: 'none', padding: 0, margin: 0, color: 'inherit', fontSize: 12, lineHeight: 1, cursor: 'pointer' }}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
          </div>

          {!isNew && job && !isReadOnly && (
            <button className="btn" style={{ flexShrink: 0 }} onClick={() => setShowAddAssignment(true)}>
              Add role
            </button>
          )}
          {isNew && !isReadOnly && (
            <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create'}
            </button>
          )}
        </div>
      </div>

      {!isNew && job && (
        <>
        <div className="card" style={{ padding: 20, marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>
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

        <div className="card" style={{ padding: 20, marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Attachments</h2>
            {!isReadOnly && (
              <>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadAttachment(file);
                    e.target.value = '';
                  }}
                />
                <button className="btn" onClick={() => attachmentInputRef.current?.click()} disabled={attachmentBusy}>
                  {attachmentBusy ? 'Uploading…' : '+ Add'}
                </button>
              </>
            )}
          </div>

          {attachments.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No attachments yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {attachments.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  {a.content_type.startsWith('image/') && (
                    <img
                      src={`/api/v1/jobs/${job.id}/attachments/${a.id}`}
                      alt=""
                      style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                    />
                  )}
                  <a href={`/api/v1/jobs/${job.id}/attachments/${a.id}`} style={{ color: 'var(--accent)' }}>
                    {a.original_name}
                  </a>
                  <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                    · {formatFileSize(a.size)} · {a.uploaded_by_name} ·{' '}
                    <span title={formatDateTime(a.created_at)}>{formatRelativeTime(a.created_at)}</span>
                  </span>
                  {!isReadOnly && (
                    <button
                      onClick={() => deleteAttachment(a.id)}
                      disabled={attachmentBusy}
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
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 20, marginTop: 20 }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Comments</h2>

          {!isReadOnly && (
            <div
              style={{ marginBottom: 16 }}
              onFocus={() => setComposerFocused(true)}
              onBlur={(e) => {
                // onBlur fires whenever ANY descendant loses focus (it's
                // focusout under the hood, which bubbles) — only treat it as
                // "left the composer" if focus didn't just move to another
                // element still inside this div (e.g. the button below).
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setComposerFocused(false);
              }}
            >
              <textarea
                ref={commentInputRef}
                rows={3}
                placeholder="Write a comment…"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginBottom: 8 }}
              />
              {composerFocused && (
                <button className="btn btn-primary" onClick={postComment} disabled={commentBusy || !newComment.trim()}>
                  {commentBusy ? 'Posting…' : 'Add comment'}
                </button>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {comments.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No comments yet.</div>}
            {comments.map((c) => {
              const isOwn = c.author_person_id === (user?.id ?? null);
              const isEditing = editingCommentId === c.id;
              return (
                <div key={c.id} style={{ display: 'flex', gap: 8, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
                  <div
                    style={{
                      maxWidth: '75%',
                      width: isEditing ? '75%' : undefined,
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: isOwn ? 'color-mix(in srgb, var(--accent) 16%, var(--panel-alt))' : 'var(--panel-alt)',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-dim)', marginBottom: 2 }}>{c.author_name}</div>
                    {isEditing ? (
                      <div>
                        <textarea
                          rows={Math.max(2, editCommentBody.split('\n').length)}
                          value={editCommentBody}
                          onChange={(e) => setEditCommentBody(e.target.value)}
                          style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginBottom: 6 }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                          <button className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setEditingCommentId(null)}>
                            Cancel
                          </button>
                          <button
                            className="btn btn-primary"
                            style={{ padding: '2px 8px', fontSize: 12 }}
                            onClick={saveEditComment}
                            disabled={commentBusy || !editCommentBody.trim()}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{c.body}</div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 6,
                        fontSize: 11,
                        color: 'var(--text-dim)',
                      }}
                    >
                      <span title={formatDateTime(c.created_at)}>{formatRelativeTime(c.created_at)}</span>
                      {!isReadOnly && isOwn && !isEditing && (
                        <span style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => startEditComment(c)}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              font: 'inherit',
                              fontSize: 11,
                              color: 'var(--text-dim)',
                              opacity: 0.6,
                              cursor: 'pointer',
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteComment(c.id)}
                            disabled={commentBusy}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              font: 'inherit',
                              fontSize: 11,
                              color: 'var(--danger)',
                              opacity: 0.6,
                              cursor: 'pointer',
                            }}
                          >
                            Delete
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </>
      )}

      {showAddAssignment && job && (
        <AddAssignmentModal
          jobId={job.id}
          people={people}
          onClose={() => setShowAddAssignment(false)}
          onAdded={reloadAssignments}
        />
      )}

      {showAddChecklistItem && job && (
        <AddChecklistItemModal jobId={job.id} onClose={() => setShowAddChecklistItem(false)} onAdded={onChecklistItemAdded} />
      )}
    </div>
  );
}
