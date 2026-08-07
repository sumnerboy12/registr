import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { ChecklistItemAttachment, ChecklistItemComment, ChecklistItemStatus, JobChecklistItem } from '../types';
import { CHECKLIST_ITEM_STATUSES, CHECKLIST_ITEM_STATUS_COLORS, CHECKLIST_ITEM_STATUS_LABELS } from '../types';
import { formatDateTime, formatRelativeTime, formatFileSize } from '../lib/formatDate';

interface Props {
  jobId: string;
  item: JobChecklistItem;
  isReadOnly: boolean;
  currentUserId: number | null;
  onClose: () => void;
  // Applied to the item's row in the parent's checklist list — keeps status,
  // label, notes, and the comment/attachment counts shown there in sync
  // without the parent needing to re-fetch the whole checklist.
  onItemChange: (updated: JobChecklistItem) => void;
}

export default function ChecklistItemModal({ jobId, item, isReadOnly, currentUserId, onClose, onItemChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [comments, setComments] = useState<ChecklistItemComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [composerFocused, setComposerFocused] = useState(false);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentBody, setEditCommentBody] = useState('');

  const [attachments, setAttachments] = useState<ChecklistItemAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // Loaded lazily, only once the modal for this item is actually opened —
  // with a checklist that can run long, fetching every item's comments and
  // attachments up front just to show a count would be wasteful.
  useEffect(() => {
    api
      .getChecklistItemComments(jobId, item.id)
      .then(setComments)
      .finally(() => setCommentsLoading(false));
    api
      .getChecklistItemAttachments(jobId, item.id)
      .then(setAttachments)
      .finally(() => setAttachmentsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const setStatus = async (status: ChecklistItemStatus) => {
    setBusy(true);
    setError(null);
    try {
      onItemChange(await api.updateJobChecklistItem(jobId, item.id, { status }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setBusy(false);
    }
  };

  const saveLabel = async (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || trimmed === item.label) return;
    setError(null);
    try {
      onItemChange(await api.updateJobChecklistItem(jobId, item.id, { label: trimmed }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save label');
    }
  };

  const saveNotes = async (notes: string) => {
    const trimmed = notes.trim();
    if (trimmed === (item.notes ?? '')) return;
    setError(null);
    try {
      onItemChange(await api.updateJobChecklistItem(jobId, item.id, { notes: trimmed || null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save note');
    }
  };

  const toggleInternal = async (internal: boolean) => {
    setError(null);
    try {
      onItemChange(await api.updateJobChecklistItem(jobId, item.id, { internal }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    }
  };

  const postComment = async () => {
    if (!newComment.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const comment = await api.addChecklistItemComment(jobId, item.id, newComment.trim());
      setComments((prev) => [comment, ...prev]);
      onItemChange({ ...item, comment_count: item.comment_count + 1 });
      setNewComment('');
      commentInputRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post comment');
    } finally {
      setBusy(false);
    }
  };

  const saveEditComment = async () => {
    if (editingCommentId == null || !editCommentBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateChecklistItemComment(jobId, item.id, editingCommentId, editCommentBody.trim());
      setComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditingCommentId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update comment');
    } finally {
      setBusy(false);
    }
  };

  const deleteComment = async (commentId: number) => {
    if (!confirm("Delete this comment? This can't be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteChecklistItemComment(jobId, item.id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      onItemChange({ ...item, comment_count: Math.max(0, item.comment_count - 1) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete comment');
    } finally {
      setBusy(false);
    }
  };

  const uploadAttachment = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const attachment = await api.uploadChecklistItemAttachment(jobId, item.id, file);
      setAttachments((prev) => [attachment, ...prev]);
      onItemChange({ ...item, attachment_count: item.attachment_count + 1 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload attachment');
    } finally {
      setBusy(false);
    }
  };

  const deleteAttachment = async (attachmentId: number) => {
    if (!confirm("Delete this attachment? This can't be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteChecklistItemAttachment(jobId, item.id, attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      onItemChange({ ...item, attachment_count: Math.max(0, item.attachment_count - 1) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete attachment');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        {isReadOnly ? (
          <h2>{item.label}</h2>
        ) : (
          <input
            defaultValue={item.label}
            onBlur={(e) => saveLabel(e.target.value)}
            style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, width: '100%', boxSizing: 'border-box' }}
          />
        )}

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {CHECKLIST_ITEM_STATUSES.map((s) => (
            <button
              key={s}
              className="btn"
              disabled={isReadOnly || busy}
              onClick={() => setStatus(s)}
              style={{
                fontSize: 12,
                borderColor: item.status === s ? CHECKLIST_ITEM_STATUS_COLORS[s] : undefined,
                background: item.status === s ? CHECKLIST_ITEM_STATUS_COLORS[s] : undefined,
                color: item.status === s ? 'white' : undefined,
              }}
            >
              {CHECKLIST_ITEM_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        {item.status_by_name && item.status_at && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: -10, marginBottom: 16 }}>
            Set to {CHECKLIST_ITEM_STATUS_LABELS[item.status]} by {item.status_by_name} ·{' '}
            <span title={formatDateTime(item.status_at)}>{formatRelativeTime(item.status_at)}</span>
          </div>
        )}

        <label
          title="Left out of the customer-facing PDF export — still shown everywhere else"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}
        >
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={item.internal}
            disabled={isReadOnly}
            onChange={(e) => toggleInternal(e.target.checked)}
          />
          Internal
        </label>

        <div className="field">
          <label>Note</label>
          {isReadOnly ? (
            <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{item.notes || <span style={{ color: 'var(--text-dim)' }}>—</span>}</div>
          ) : (
            <textarea defaultValue={item.notes ?? ''} rows={2} placeholder="Note…" onBlur={(e) => saveNotes(e.target.value)} />
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Comments</h3>
          {!isReadOnly && (
            <div
              style={{ marginBottom: 12 }}
              onFocus={() => setComposerFocused(true)}
              onBlur={(e) => {
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
                <button className="btn btn-primary" onClick={postComment} disabled={busy || !newComment.trim()}>
                  {busy ? 'Posting…' : 'Add comment'}
                </button>
              )}
            </div>
          )}
          {commentsLoading ? (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 260, overflowY: 'auto' }}>
              {comments.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No comments yet.</div>}
              {comments.map((c) => {
                const isOwn = c.author_person_id === currentUserId;
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
                              disabled={busy || !editCommentBody.trim()}
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
                              onClick={() => {
                                setEditingCommentId(c.id);
                                setEditCommentBody(c.body);
                              }}
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
                              disabled={busy}
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
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ fontSize: 14, margin: 0 }}>Attachments</h3>
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
                <button className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => attachmentInputRef.current?.click()} disabled={busy}>
                  {busy ? 'Uploading…' : '+ Add'}
                </button>
              </>
            )}
          </div>
          {attachmentsLoading ? (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading…</div>
          ) : attachments.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No attachments yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {attachments.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  {a.content_type.startsWith('image/') && (
                    <img
                      src={`/api/v1/jobs/${jobId}/checklist/${item.id}/attachments/${a.id}`}
                      alt=""
                      style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                    />
                  )}
                  <a href={`/api/v1/jobs/${jobId}/checklist/${item.id}/attachments/${a.id}`} style={{ color: 'var(--accent)' }}>
                    {a.original_name}
                  </a>
                  <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                    · {formatFileSize(a.size)} · {a.uploaded_by_name} ·{' '}
                    <span title={formatDateTime(a.created_at)}>{formatRelativeTime(a.created_at)}</span>
                  </span>
                  {!isReadOnly && (
                    <button
                      onClick={() => deleteAttachment(a.id)}
                      disabled={busy}
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--danger)', opacity: 0.6, cursor: 'pointer' }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 16 }}>{error}</div>}

        <div className="modal-actions">
          <div />
          <div className="right">
            <button className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
