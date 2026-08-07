import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import db from '../db/index.js';
import { requireAuth, requireWrite } from '../middleware/auth.js';
import { requireAuthOrApiKey } from '../middleware/apiKey.js';
import { hasThinkSafeSite } from '../lib/thinksafeSync.js';
import { uploadAttachment, attachmentFilePath, uploadChecklistItemAttachment, checklistItemAttachmentFilePath } from '../lib/attachments.js';
import { CHECKLIST_STAGES } from '../lib/checklistStages.js';
import { CHECKLIST_ITEM_STATUSES } from '../lib/checklistStatuses.js';
import { JOB_TYPES as TYPES } from '../lib/jobTypes.js';
import { JOB_STATUSES as STATUSES } from '../lib/jobStatuses.js';

const router = Router();
const ASSIGNMENT_ROLES = ['project_manager', 'site_supervisor', 'estimator', 'qs'];

// Practical Completion / Awaiting Retentions are retentions-scheme statuses
// specific to Contract jobs — Minor Works and Remedial jobs don't hold
// retentions, so those statuses are meaningless (and confusing) on them.
const CONTRACT_ONLY_STATUSES = ['practical_completion', 'awaiting_retentions'];

function loadAssignments(jobId) {
  return db
    .prepare(
      `SELECT ja.id, ja.job_id, ja.role, p.id AS person_id, p.name AS person_name, p.email AS person_email
       FROM job_assignments ja
       JOIN people p ON p.id = ja.person_id
       WHERE ja.job_id = ?
       ORDER BY ja.role, p.name COLLATE NOCASE`
    )
    .all(jobId)
    .map((a) => ({
      id: a.id,
      role: a.role,
      person: { id: a.person_id, name: a.person_name, email: a.person_email },
    }));
}

// Copies the given (already-filtered) checklist_templates rows onto a job
// as its own snapshot copy — used both at job creation (every active
// template item) and by POST /:id/checklist/sync (just the ones missing).
function copyChecklistTemplateToJob(jobId, templateRows) {
  const insert = db.prepare(
    `INSERT INTO job_checklist_items (job_id, template_id, stage, label, sequence) VALUES (?, ?, ?, ?, ?)`
  );
  for (const t of templateRows) insert.run(jobId, t.id, t.stage, t.label, t.sequence);
}

// comment_count/attachment_count are computed here (rather than loaded
// separately per item) so the checklist list view can show them without a
// round trip per item — important once a job's checklist gets long.
const CHECKLIST_ITEM_COLUMNS = `jci.*,
  (SELECT COUNT(*) FROM job_checklist_item_comments c WHERE c.item_id = jci.id) AS comment_count,
  (SELECT COUNT(*) FROM job_checklist_item_attachments a WHERE a.item_id = jci.id) AS attachment_count`;

function getChecklistItem(itemId) {
  return db.prepare(`SELECT ${CHECKLIST_ITEM_COLUMNS} FROM job_checklist_items jci WHERE jci.id = ?`).get(itemId);
}

function listChecklistItems(jobId) {
  return db
    .prepare(`SELECT ${CHECKLIST_ITEM_COLUMNS} FROM job_checklist_items jci WHERE jci.job_id = ? ORDER BY jci.stage, jci.sequence, jci.id`)
    .all(jobId);
}

function publicJob(row, { includeAssignments } = {}) {
  const job = { ...row };
  job.thinksafe_site = hasThinkSafeSite(row.code);
  if (includeAssignments) job.assignments = loadAssignments(row.id);
  return job;
}

// Contract: YYXXX (e.g. "26001"). Minor works: MYYXXX (e.g. "M26001").
// Remedial: RYYXXX (e.g. "R26001") — same shape, just prefixed, and counted
// separately: a contract/minor works/remedial job created the same year
// can all be "…001". XXX is the lowest unused number for that year/type,
// looking at every job ever coded that year (including Closed) so a number
// is never reused once assigned.
const TYPE_PREFIXES = { minor_works: 'M', remedial: 'R' };
function generateJobCode(jobType) {
  const yy = String(new Date().getFullYear() % 100).padStart(2, '0');
  const prefix = `${TYPE_PREFIXES[jobType] ?? ''}${yy}`;
  const rows = db.prepare('SELECT code FROM jobs WHERE code LIKE ?').all(`${prefix}%`);
  let max = 0;
  for (const { code } of rows) {
    const suffix = code.slice(prefix.length);
    if (/^\d{3}$/.test(suffix)) max = Math.max(max, Number(suffix));
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

router.get('/', requireAuthOrApiKey, (req, res) => {
  const { status, type, client_id, q, updated_since, include, archived, mine } = req.query;
  const clauses = [];
  const params = [];

  // Assigned to any role (PM/site supervisor/estimator/QS), not just PM —
  // broader than the QA Outstanding report's own "mine" filter (see
  // lib/reports/qaOutstanding.js), which is deliberately PM-only. req.person
  // is only set for a signed-in session (requireAuth), not an API-key
  // caller (requireApiKey) — mine is simply ignored for the latter, since
  // it's a UI-only filter no consuming app has a reason to send.
  if (mine === '1' && req.person) {
    clauses.push('EXISTS (SELECT 1 FROM job_assignments ja WHERE ja.job_id = jobs.id AND ja.person_id = ?)');
    params.push(req.person.id);
  }

  if (status) {
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    clauses.push('jobs.status = ?');
    params.push(status);
  } else if (archived !== '1') {
    // Closed jobs are hidden unless explicitly asked for (archived=1, which
    // includes them alongside everything else — registr never hard-deletes
    // a job, it just archives via status) — used by rostr's job sync
    // (lib/jobSync.js), which needs every job regardless of status.
    clauses.push('jobs.status != ?');
    params.push('closed');
  }
  if (type) {
    if (!TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
    clauses.push('jobs.job_type = ?');
    params.push(type);
  }
  if (client_id) {
    clauses.push('jobs.client_id = ?');
    params.push(Number(client_id));
  }
  if (updated_since) {
    clauses.push('jobs.updated_at > ?');
    params.push(updated_since);
  }

  // clients is left-joined (not inner) so a job with no client linked still
  // shows up. Aliased linked_client_name rather than client_name to avoid
  // colliding with jobs' own client_name column (the free-text fallback
  // used when client_id isn't set — see routes/jobs.js POST/PATCH below).
  let sql = 'SELECT jobs.*, clients.name AS linked_client_name FROM jobs LEFT JOIN clients ON clients.id = jobs.client_id';
  if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
  sql += ' ORDER BY jobs.code COLLATE NOCASE';

  let rows = db.prepare(sql).all(...params);
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter(
      (p) =>
        p.code.toLowerCase().includes(needle) ||
        p.name.toLowerCase().includes(needle) ||
        (p.linked_client_name ?? '').toLowerCase().includes(needle) ||
        (p.client_name ?? '').toLowerCase().includes(needle)
    );
  }

  const includeAssignments = include === 'assignments';
  res.json(
    rows.map(({ linked_client_name, ...row }) => publicJob(row, { includeAssignments }))
  );
});

// Previews the code a new job of this type would get right now — used to
// prefill the New Job form. Not reserved: the actual code is (re)computed
// again at creation time, so this is only ever a suggestion.
router.get('/next-code', requireAuth, requireWrite, (req, res) => {
  const { job_type } = req.query;
  if (!TYPES.includes(job_type)) return res.status(400).json({ error: 'Invalid job_type' });
  res.json({ code: generateJobCode(job_type) });
});

router.get('/by-code/:code', requireAuthOrApiKey, (req, res) => {
  const row = db.prepare('SELECT * FROM jobs WHERE code = ?').get(req.params.code);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(publicJob(row, { includeAssignments: req.query.include === 'assignments' }));
});

router.get('/:id', requireAuthOrApiKey, (req, res) => {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(publicJob(row, { includeAssignments: req.query.include === 'assignments' }));
});

router.post('/', requireAuth, requireWrite, (req, res) => {
  const { code, name, client_id, client_name, contact_name, contact_email, job_type, status, site_address, value, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!TYPES.includes(job_type)) return res.status(400).json({ error: 'Invalid job_type' });
  if (status != null && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (CONTRACT_ONLY_STATUSES.includes(status) && job_type !== 'contract') {
    return res.status(400).json({ error: 'That status only applies to Contract jobs' });
  }

  // Code is admin-only to set by hand — anyone else gets the auto-generated
  // one regardless of what (if anything) they sent, same as PATCH below.
  const finalCode = req.registrRole === 'admin' && code && code.trim() ? code.trim() : generateJobCode(job_type);

  // Only reachable via an admin-supplied code — generateJobCode never
  // produces a slash. The code is a URL path segment (GET /by-code/:code,
  // the client's /jobs/:code), so a slash in it would break that route.
  if (finalCode.includes('/')) return res.status(400).json({ error: "Job code can't contain a '/'" });

  const existing = db.prepare('SELECT id FROM jobs WHERE code = ?').get(finalCode);
  if (existing) return res.status(400).json({ error: 'That job code is already in use' });

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO jobs (id, code, name, client_id, client_name, contact_name, contact_email, job_type, status, site_address, value, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    finalCode,
    name.trim(),
    client_id || null,
    // client_name is a free-text fallback for when no client_id is picked
    // from the list — irrelevant (and cleared) once a real client is linked.
    client_id ? null : client_name || null,
    contact_name || null,
    contact_email || null,
    job_type,
    status || 'tendering',
    site_address || null,
    value ?? null,
    notes || null
  );

  // Every new job starts with its own copy of the current active QA
  // checklist template for its job type — see copyChecklistTemplateToJob
  // above. job_type IS NULL means an item common to every job type.
  const templates = db
    .prepare('SELECT * FROM checklist_templates WHERE active = 1 AND (job_type = ? OR job_type IS NULL) ORDER BY stage, sequence, id')
    .all(job_type);
  copyChecklistTemplateToJob(id, templates);

  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  res.status(201).json(publicJob(row, { includeAssignments: true }));
});

router.patch('/:id', requireAuth, requireWrite, (req, res) => {
  const existing = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  // code is immutable once a job exists — regardless of role, including
  // admin. It's a URL path segment (GET /by-code/:code, the client's
  // /jobs/:code) and the external-facing reference everyone already uses
  // (invoices, job folders, site boards), so it can't just change under a
  // job. Any value sent for it is ignored rather than erroring, since the
  // form has it disabled here anyway.
  //
  // job_type CAN change (e.g. a job originally quoted as Minor Works turns
  // out to need a full Contract) — its code doesn't follow along, so the
  // code's M/R prefix (see generateJobCode) reflects the type at *creation*
  // time, not necessarily the current one. That's a cosmetic mismatch, not
  // a functional one: nothing besides generateJobCode's own numbering reads
  // the prefix, and rostr's sync already treats job_type as a plain mutable
  // field (see rostr's lib/jobSync.js) — it'll pick up the change on its
  // next sync same as any other edit, no re-matching involved.
  const { name, client_id, client_name, contact_name, contact_email, job_type, status, site_address, value, notes } = req.body;
  if (job_type != null && !TYPES.includes(job_type)) return res.status(400).json({ error: 'Invalid job_type' });
  if (status != null && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const nextJobType = job_type ?? existing.job_type;
  const nextStatus = status ?? existing.status;
  if (CONTRACT_ONLY_STATUSES.includes(nextStatus) && nextJobType !== 'contract') {
    return res.status(400).json({ error: 'That status only applies to Contract jobs' });
  }

  const nextClientId = client_id !== undefined ? client_id : existing.client_id;
  db.prepare(
    `UPDATE jobs SET
       name = ?, client_id = ?, client_name = ?, contact_name = ?, contact_email = ?, job_type = ?, status = ?, site_address = ?, value = ?,
       notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    nextClientId,
    // Cleared as soon as a real client is linked — see POST above.
    nextClientId ? null : client_name !== undefined ? client_name || null : existing.client_name,
    contact_name !== undefined ? contact_name || null : existing.contact_name,
    contact_email !== undefined ? contact_email || null : existing.contact_email,
    nextJobType,
    nextStatus,
    site_address !== undefined ? site_address : existing.site_address,
    value !== undefined ? value : existing.value,
    notes !== undefined ? notes : existing.notes,
    existing.id
  );

  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(existing.id);
  res.json(publicJob(row, { includeAssignments: true }));
});

router.post('/:id/assignments', requireAuth, requireWrite, (req, res) => {
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });

  const { person_id, role } = req.body;
  if (!ASSIGNMENT_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const person = db.prepare('SELECT id FROM people WHERE id = ?').get(person_id);
  if (!person) return res.status(400).json({ error: 'Unknown person' });

  try {
    db.prepare('INSERT INTO job_assignments (job_id, person_id, role) VALUES (?, ?, ?)').run(job.id, person_id, role);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(400).json({ error: 'That person already holds that role on this job' });
    throw e;
  }

  res.status(201).json(loadAssignments(job.id));
});

router.delete('/:id/assignments/:assignmentId', requireAuth, requireWrite, (req, res) => {
  db.prepare('DELETE FROM job_assignments WHERE id = ? AND job_id = ?').run(Number(req.params.assignmentId), req.params.id);
  res.status(204).end();
});

// Most recent first.
router.get('/:id/comments', requireAuthOrApiKey, (req, res) => {
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  const rows = db
    .prepare(
      `SELECT id, author_person_id, author_name, body, created_at FROM job_comments
       WHERE job_id = ? ORDER BY created_at DESC, id DESC`
    )
    .all(job.id);
  res.json(rows);
});

router.post('/:id/comments', requireAuth, requireWrite, (req, res) => {
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });

  const body = (req.body.body ?? '').trim();
  if (!body) return res.status(400).json({ error: 'Comment body is required' });

  const result = db
    .prepare('INSERT INTO job_comments (job_id, author_person_id, author_name, body) VALUES (?, ?, ?, ?)')
    .run(job.id, req.person.id, req.person.name, body);
  const row = db
    .prepare('SELECT id, author_person_id, author_name, body, created_at FROM job_comments WHERE id = ?')
    .get(result.lastInsertRowid);
  res.status(201).json(row);
});

// Own comments only — a break-glass admin (author_person_id NULL) can only
// edit/delete other NULL-authored comments, which is fine since there's
// only ever one such account.
router.patch('/:id/comments/:commentId', requireAuth, requireWrite, (req, res) => {
  const comment = db
    .prepare('SELECT author_person_id FROM job_comments WHERE id = ? AND job_id = ?')
    .get(Number(req.params.commentId), req.params.id);
  if (!comment) return res.status(404).json({ error: 'not found' });
  if (comment.author_person_id !== req.person.id) {
    return res.status(403).json({ error: 'You can only edit your own comments' });
  }
  const body = (req.body.body ?? '').trim();
  if (!body) return res.status(400).json({ error: 'Comment body is required' });
  db.prepare('UPDATE job_comments SET body = ? WHERE id = ?').run(body, Number(req.params.commentId));
  const row = db
    .prepare('SELECT id, author_person_id, author_name, body, created_at FROM job_comments WHERE id = ?')
    .get(Number(req.params.commentId));
  res.json(row);
});

router.delete('/:id/comments/:commentId', requireAuth, requireWrite, (req, res) => {
  const comment = db
    .prepare('SELECT author_person_id FROM job_comments WHERE id = ? AND job_id = ?')
    .get(Number(req.params.commentId), req.params.id);
  if (!comment) return res.status(404).json({ error: 'not found' });
  if (comment.author_person_id !== req.person.id) {
    return res.status(403).json({ error: 'You can only delete your own comments' });
  }
  db.prepare('DELETE FROM job_comments WHERE id = ?').run(Number(req.params.commentId));
  res.status(204).end();
});

// Most recent first, metadata only — no file bytes in this response (see
// GET /:id/attachments/:attachmentId for the actual download).
router.get('/:id/attachments', requireAuthOrApiKey, (req, res) => {
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  const rows = db
    .prepare(
      `SELECT id, original_name, content_type, size, uploaded_by_name, created_at FROM job_attachments
       WHERE job_id = ? ORDER BY created_at DESC, id DESC`
    )
    .all(job.id);
  res.json(rows);
});

router.post('/:id/attachments', requireAuth, requireWrite, (req, res) => {
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });

  uploadAttachment(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const result = db
      .prepare(
        `INSERT INTO job_attachments (job_id, filename, original_name, content_type, size, uploaded_by_person_id, uploaded_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(job.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.person.id, req.person.name);
    const row = db
      .prepare('SELECT id, original_name, content_type, size, uploaded_by_name, created_at FROM job_attachments WHERE id = ?')
      .get(result.lastInsertRowid);
    res.status(201).json(row);
  });
});

router.get('/:id/attachments/:attachmentId', requireAuthOrApiKey, (req, res) => {
  const attachment = db
    .prepare('SELECT * FROM job_attachments WHERE id = ? AND job_id = ?')
    .get(Number(req.params.attachmentId), req.params.id);
  if (!attachment) return res.status(404).json({ error: 'not found' });
  const filePath = attachmentFilePath(attachment.job_id, attachment.filename);
  res.download(filePath, attachment.original_name, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'File missing on disk' });
  });
});

router.delete('/:id/attachments/:attachmentId', requireAuth, requireWrite, (req, res) => {
  const attachment = db
    .prepare('SELECT * FROM job_attachments WHERE id = ? AND job_id = ?')
    .get(Number(req.params.attachmentId), req.params.id);
  if (!attachment) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM job_attachments WHERE id = ?').run(attachment.id);
  fs.unlink(attachmentFilePath(attachment.job_id, attachment.filename), () => {});
  res.status(204).end();
});

router.get('/:id/checklist', requireAuthOrApiKey, (req, res) => {
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  res.json(listChecklistItems(job.id));
});

// Pulls in any active template item this job doesn't already have a copy
// of (matched via template_id) — lets a template change (a new QA step
// added company-wide) reach jobs that were created before it existed,
// without duplicating anything the job already has.
router.post('/:id/checklist/sync', requireAuth, requireWrite, (req, res) => {
  const job = db.prepare('SELECT id, job_type FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });

  const existingTemplateIds = new Set(
    db
      .prepare('SELECT template_id FROM job_checklist_items WHERE job_id = ? AND template_id IS NOT NULL')
      .all(job.id)
      .map((r) => r.template_id)
  );
  const missing = db
    .prepare('SELECT * FROM checklist_templates WHERE active = 1 AND (job_type = ? OR job_type IS NULL) ORDER BY stage, sequence, id')
    .all(job.job_type)
    .filter((t) => !existingTemplateIds.has(t.id));
  copyChecklistTemplateToJob(job.id, missing);

  res.json(listChecklistItems(job.id));
});

// A job-specific, ad-hoc item with no template counterpart (template_id NULL).
router.post('/:id/checklist', requireAuth, requireWrite, (req, res) => {
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });

  const { stage, label } = req.body;
  if (!CHECKLIST_STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });
  if (!label || !label.trim()) return res.status(400).json({ error: 'label is required' });

  const { n: nextSequence } = db
    .prepare('SELECT COALESCE(MAX(sequence), -1) + 1 AS n FROM job_checklist_items WHERE job_id = ? AND stage = ?')
    .get(job.id, stage);
  const result = db
    .prepare('INSERT INTO job_checklist_items (job_id, template_id, stage, label, sequence) VALUES (?, NULL, ?, ?, ?)')
    .run(job.id, stage, label.trim(), nextSequence);
  res.status(201).json(getChecklistItem(result.lastInsertRowid));
});

router.patch('/:id/checklist/:itemId', requireAuth, requireWrite, (req, res) => {
  const item = db
    .prepare('SELECT * FROM job_checklist_items WHERE id = ? AND job_id = ?')
    .get(Number(req.params.itemId), req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });

  const { status, label, notes } = req.body;
  if (status != null) {
    if (!CHECKLIST_ITEM_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    db.prepare(
      `UPDATE job_checklist_items SET status = ?, status_by_person_id = ?, status_by_name = ?, status_at = datetime('now') WHERE id = ?`
    ).run(status, req.person.id, req.person.name, item.id);
  }
  if (label !== undefined) {
    if (!label.trim()) return res.status(400).json({ error: 'label is required' });
    db.prepare('UPDATE job_checklist_items SET label = ? WHERE id = ?').run(label.trim(), item.id);
  }
  if (notes !== undefined) {
    db.prepare('UPDATE job_checklist_items SET notes = ? WHERE id = ?').run(notes ? notes.trim() || null : null, item.id);
  }

  res.json(getChecklistItem(item.id));
});

router.delete('/:id/checklist/:itemId', requireAuth, requireWrite, (req, res) => {
  db.prepare('DELETE FROM job_checklist_items WHERE id = ? AND job_id = ?').run(Number(req.params.itemId), req.params.id);
  res.status(204).end();
});

// Most recent first, same shape/rules as job-level comments (see
// POST/PATCH/DELETE /:id/comments above) but scoped to one checklist item.
router.get('/:id/checklist/:itemId/comments', requireAuthOrApiKey, (req, res) => {
  const item = db.prepare('SELECT id FROM job_checklist_items WHERE id = ? AND job_id = ?').get(Number(req.params.itemId), req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  const rows = db
    .prepare(
      `SELECT id, author_person_id, author_name, body, created_at FROM job_checklist_item_comments
       WHERE item_id = ? ORDER BY created_at DESC, id DESC`
    )
    .all(item.id);
  res.json(rows);
});

router.post('/:id/checklist/:itemId/comments', requireAuth, requireWrite, (req, res) => {
  const item = db.prepare('SELECT id FROM job_checklist_items WHERE id = ? AND job_id = ?').get(Number(req.params.itemId), req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });

  const body = (req.body.body ?? '').trim();
  if (!body) return res.status(400).json({ error: 'Comment body is required' });

  const result = db
    .prepare('INSERT INTO job_checklist_item_comments (item_id, author_person_id, author_name, body) VALUES (?, ?, ?, ?)')
    .run(item.id, req.person.id, req.person.name, body);
  const row = db
    .prepare('SELECT id, author_person_id, author_name, body, created_at FROM job_checklist_item_comments WHERE id = ?')
    .get(result.lastInsertRowid);
  res.status(201).json(row);
});

// Own comments only — see the equivalent job-level comment routes above for
// why a NULL-authored (break-glass admin) comment is scoped the same way.
router.patch('/:id/checklist/:itemId/comments/:commentId', requireAuth, requireWrite, (req, res) => {
  const comment = db
    .prepare('SELECT author_person_id FROM job_checklist_item_comments WHERE id = ? AND item_id = ?')
    .get(Number(req.params.commentId), Number(req.params.itemId));
  if (!comment) return res.status(404).json({ error: 'not found' });
  if (comment.author_person_id !== req.person.id) {
    return res.status(403).json({ error: 'You can only edit your own comments' });
  }
  const body = (req.body.body ?? '').trim();
  if (!body) return res.status(400).json({ error: 'Comment body is required' });
  db.prepare('UPDATE job_checklist_item_comments SET body = ? WHERE id = ?').run(body, Number(req.params.commentId));
  const row = db
    .prepare('SELECT id, author_person_id, author_name, body, created_at FROM job_checklist_item_comments WHERE id = ?')
    .get(Number(req.params.commentId));
  res.json(row);
});

router.delete('/:id/checklist/:itemId/comments/:commentId', requireAuth, requireWrite, (req, res) => {
  const comment = db
    .prepare('SELECT author_person_id FROM job_checklist_item_comments WHERE id = ? AND item_id = ?')
    .get(Number(req.params.commentId), Number(req.params.itemId));
  if (!comment) return res.status(404).json({ error: 'not found' });
  if (comment.author_person_id !== req.person.id) {
    return res.status(403).json({ error: 'You can only delete your own comments' });
  }
  db.prepare('DELETE FROM job_checklist_item_comments WHERE id = ?').run(Number(req.params.commentId));
  res.status(204).end();
});

// Most recent first, metadata only — same shape/rules as job-level
// attachments (see /:id/attachments above) but scoped to one checklist item.
router.get('/:id/checklist/:itemId/attachments', requireAuthOrApiKey, (req, res) => {
  const item = db.prepare('SELECT id FROM job_checklist_items WHERE id = ? AND job_id = ?').get(Number(req.params.itemId), req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  const rows = db
    .prepare(
      `SELECT id, original_name, content_type, size, uploaded_by_name, created_at FROM job_checklist_item_attachments
       WHERE item_id = ? ORDER BY created_at DESC, id DESC`
    )
    .all(item.id);
  res.json(rows);
});

router.post('/:id/checklist/:itemId/attachments', requireAuth, requireWrite, (req, res) => {
  const item = db.prepare('SELECT id FROM job_checklist_items WHERE id = ? AND job_id = ?').get(Number(req.params.itemId), req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });

  uploadChecklistItemAttachment(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const result = db
      .prepare(
        `INSERT INTO job_checklist_item_attachments (item_id, filename, original_name, content_type, size, uploaded_by_person_id, uploaded_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(item.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.person.id, req.person.name);
    const row = db
      .prepare('SELECT id, original_name, content_type, size, uploaded_by_name, created_at FROM job_checklist_item_attachments WHERE id = ?')
      .get(result.lastInsertRowid);
    res.status(201).json(row);
  });
});

router.get('/:id/checklist/:itemId/attachments/:attachmentId', requireAuthOrApiKey, (req, res) => {
  const attachment = db
    .prepare('SELECT * FROM job_checklist_item_attachments WHERE id = ? AND item_id = ?')
    .get(Number(req.params.attachmentId), Number(req.params.itemId));
  if (!attachment) return res.status(404).json({ error: 'not found' });
  const filePath = checklistItemAttachmentFilePath(req.params.id, req.params.itemId, attachment.filename);
  res.download(filePath, attachment.original_name, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'File missing on disk' });
  });
});

router.delete('/:id/checklist/:itemId/attachments/:attachmentId', requireAuth, requireWrite, (req, res) => {
  const attachment = db
    .prepare('SELECT * FROM job_checklist_item_attachments WHERE id = ? AND item_id = ?')
    .get(Number(req.params.attachmentId), Number(req.params.itemId));
  if (!attachment) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM job_checklist_item_attachments WHERE id = ?').run(attachment.id);
  fs.unlink(checklistItemAttachmentFilePath(req.params.id, req.params.itemId, attachment.filename), () => {});
  res.status(204).end();
});

export default router;
