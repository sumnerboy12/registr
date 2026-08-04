import { Router } from 'express';
import crypto from 'node:crypto';
import db from '../db/index.js';
import { requireAuth, requireWrite } from '../middleware/auth.js';
import { requireAuthOrApiKey } from '../middleware/apiKey.js';

const router = Router();

const TYPES = ['contract', 'minor_works'];
const STATUSES = ['tendering', 'awarded', 'active', 'on_hold', 'practical_completion', 'closed'];
const ASSIGNMENT_ROLES = ['project_manager', 'site_supervisor', 'estimator', 'qs'];

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

function publicJob(row, { includeAssignments } = {}) {
  const job = { ...row };
  if (includeAssignments) job.assignments = loadAssignments(row.id);
  return job;
}

// Contract: YYXX (e.g. "2601"). Minor works: MYYXX (e.g. "M2601") — same
// shape, just prefixed, and counted separately: a contract job and a minor
// works job created the same year can both be "…01". XX is the lowest
// unused number for that year/type, looking at every job ever coded that
// year (including Closed) so a number is never reused once assigned.
function generateJobCode(jobType) {
  const yy = String(new Date().getFullYear() % 100).padStart(2, '0');
  const prefix = jobType === 'minor_works' ? `M${yy}` : yy;
  const rows = db.prepare('SELECT code FROM jobs WHERE code LIKE ?').all(`${prefix}%`);
  let max = 0;
  for (const { code } of rows) {
    const suffix = code.slice(prefix.length);
    if (/^\d{2}$/.test(suffix)) max = Math.max(max, Number(suffix));
  }
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

router.get('/', requireAuthOrApiKey, (req, res) => {
  const { status, type, client_id, q, updated_since, include, archived } = req.query;
  const clauses = [];
  const params = [];

  if (status) {
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    clauses.push('jobs.status = ?');
    params.push(status);
  } else if (archived === '1') {
    // Archived (closed) jobs are hidden unless explicitly asked for —
    // registr never hard-deletes a job, it just archives via status.
    clauses.push('jobs.status = ?');
    params.push('closed');
  } else {
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
  // shows up — client_name just comes back null for it. Client's own name
  // and updated_at columns would otherwise collide with jobs' — see the
  // jobs.-qualified clauses above and the client_name alias below.
  let sql = 'SELECT jobs.*, clients.name AS client_name FROM jobs LEFT JOIN clients ON clients.id = jobs.client_id';
  if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
  sql += ' ORDER BY jobs.code COLLATE NOCASE';

  let rows = db.prepare(sql).all(...params);
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter(
      (p) =>
        p.code.toLowerCase().includes(needle) ||
        p.name.toLowerCase().includes(needle) ||
        (p.client_name ?? '').toLowerCase().includes(needle)
    );
  }

  const includeAssignments = include === 'assignments';
  res.json(
    rows.map(({ client_name, ...row }) => publicJob(row, { includeAssignments }))
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
  const { code, name, client_id, job_type, status, site_address, value, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!TYPES.includes(job_type)) return res.status(400).json({ error: 'Invalid job_type' });
  if (status != null && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  // Code is admin-only to set by hand — anyone else gets the auto-generated
  // one regardless of what (if anything) they sent, same as PATCH below.
  const finalCode = req.registrRole === 'admin' && code && code.trim() ? code.trim() : generateJobCode(job_type);

  const existing = db.prepare('SELECT id FROM jobs WHERE code = ?').get(finalCode);
  if (existing) return res.status(400).json({ error: 'That job code is already in use' });

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO jobs (id, code, name, client_id, job_type, status, site_address, value, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    finalCode,
    name.trim(),
    client_id || null,
    job_type,
    status || 'tendering',
    site_address || null,
    value ?? null,
    notes || null
  );

  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  res.status(201).json(publicJob(row, { includeAssignments: true }));
});

router.patch('/:id', requireAuth, requireWrite, (req, res) => {
  const existing = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { code, name, client_id, job_type, status, site_address, value, notes } = req.body;
  if (job_type != null && !TYPES.includes(job_type)) return res.status(400).json({ error: 'Invalid job_type' });
  if (status != null && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  // Code is admin-only to change — anyone else's edit to it is silently
  // ignored rather than erroring, since a non-admin's form has it disabled
  // and shouldn't be sending a real change in the first place.
  let nextCode = existing.code;
  if (req.registrRole === 'admin' && code !== undefined) {
    nextCode = code.trim();
    if (!nextCode) return res.status(400).json({ error: 'code is required' });
    const clash = db.prepare('SELECT id FROM jobs WHERE code = ? AND id != ?').get(nextCode, existing.id);
    if (clash) return res.status(400).json({ error: 'That job code is already in use' });
  }

  db.prepare(
    `UPDATE jobs SET
       code = ?, name = ?, client_id = ?, job_type = ?, status = ?, site_address = ?, value = ?,
       notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    nextCode,
    name ?? existing.name,
    client_id !== undefined ? client_id : existing.client_id,
    job_type ?? existing.job_type,
    status ?? existing.status,
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

export default router;
