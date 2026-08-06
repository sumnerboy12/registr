import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Client, Person, Job, JobAttachment, JobComment, JobStatus, JobType } from '../types';
import { ASSIGNMENT_ROLE_LABELS, CONTRACT_ONLY_STATUSES, JOB_STATUS_LABELS, JOB_TYPE_LABELS } from '../types';
import { useAuth } from '../auth/AuthContext';
import ThinkSafeBadge from '../components/ThinkSafeBadge';
import AddAssignmentModal from '../components/AddAssignmentModal';
import { formatDateTime, formatRelativeTime } from '../lib/formatDate';

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  // silently submitting an invalid combination.
  useEffect(() => {
    if (jobType !== 'contract' && CONTRACT_ONLY_STATUSES.includes(status)) setStatus('tendering');
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
    });
  }, [codeParam, isNew]);

  const handleCancel = () => navigate('/');

  const handleSave = async () => {
    if (!code.trim()) return setError('Job code is required');
    if (!name.trim()) return setError('Job name is required');
    setSaving(true);
    setError(null);
    const data = {
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
    };
    try {
      if (isNew) {
        await api.createJob(data);
      } else {
        await api.updateJob(job!.id, data);
      }
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      setSaving(false);
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

  if (loading) return <div style={{ padding: 20 }}>Loading…</div>;

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{isNew ? 'New Job' : job && `${job.code} - ${job.name}`}</span>
          {job?.thinksafe_site && <ThinkSafeBadge title="Site configured on ThinkSafe" />}
        </h1>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div className="row">
          <div className="field">
            <label>Type</label>
            <select value={jobType} onChange={(e) => setJobType(e.target.value as JobType)} disabled={isReadOnly}>
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
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={isReadOnly} />
          </div>
          <div className="field">
            <label>Client</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : '')} disabled={isReadOnly}>
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
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} disabled={isReadOnly} />
          </div>
        )}

        <div className="row">
          <div className="field">
            <label>Contact name</label>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} disabled={isReadOnly} />
          </div>
          <div className="field">
            <label>Contact email</label>
            <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} disabled={isReadOnly} />
          </div>
        </div>

        <div className="field">
          <label>Site address</label>
          <input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} disabled={isReadOnly} />
        </div>

        <div className="row">
          <div className="field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as JobStatus)} disabled={isReadOnly}>
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
                  disabled={isReadOnly}
                  style={{ paddingLeft: 20, width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isReadOnly} />
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
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}
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
            {!isNew && job && !isReadOnly && (
              <button className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setShowAddAssignment(true)}>
                Add role
              </button>
            )}
          </div>

          {isReadOnly ? (
            <button className="btn" style={{ flexShrink: 0 }} onClick={() => navigate('/')}>
              Close
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="btn" onClick={handleCancel} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>

      {!isNew && job && (
        <>
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
                <button
                  className="btn"
                  style={{ padding: '2px 8px', fontSize: 12 }}
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={attachmentBusy}
                >
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
    </div>
  );
}
