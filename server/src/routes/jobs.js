import { Router } from 'express';
import crypto from 'node:crypto';
import db from '../db/index.js';
import { requireAuth, requireWrite } from '../middleware/auth.js';
import { requireAuthOrApiKey } from '../middleware/apiKey.js';

const router = Router();

const TYPES = ['contract', 'minor_works', 'remedial'];
const STATUSES = [
  'tendering',
  'awarded',
  'active',
  'on_hold',
  'practical_completion',
  'awaiting_retentions',
  'closed',
  'lost',
];
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
  const { status, type, client_id, q, updated_since, include, archived } = req.query;
  const clauses = [];
  const params = [];

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
