import { Router } from 'express';
import crypto from 'node:crypto';
import db from '../db/index.js';
import { requireAuth, requireWrite } from '../middleware/auth.js';
import { requireAuthOrApiKey } from '../middleware/apiKey.js';

const router = Router();

const TYPES = ['contract', 'minor_works'];
const STATUSES = ['tendering', 'awarded', 'active', 'on_hold', 'practical_completion', 'closed'];
const ASSIGNMENT_ROLES = ['project_manager', 'foreman', 'estimator', 'qs'];

function loadAssignments(projectId) {
  return db
    .prepare(
      `SELECT pa.id, pa.project_id, pa.role, p.id AS person_id, p.name AS person_name, p.email AS person_email
       FROM project_assignments pa
       JOIN people p ON p.id = pa.person_id
       WHERE pa.project_id = ?
       ORDER BY pa.role, p.name COLLATE NOCASE`
    )
    .all(projectId)
    .map((a) => ({
      id: a.id,
      role: a.role,
      person: { id: a.person_id, name: a.person_name, email: a.person_email },
    }));
}

function publicProject(row, { includeAssignments } = {}) {
  const project = { ...row };
  if (includeAssignments) project.assignments = loadAssignments(row.id);
  return project;
}

router.get('/', requireAuthOrApiKey, (req, res) => {
  const { status, type, client_id, q, updated_since, include, archived } = req.query;
  const clauses = [];
  const params = [];

  if (status) {
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    clauses.push('status = ?');
    params.push(status);
  } else if (archived === '1') {
    // Archived (closed) projects are hidden unless explicitly asked for —
    // registr never hard-deletes a project, it just archives via status.
    clauses.push('status = ?');
    params.push('closed');
  } else {
    clauses.push('status != ?');
    params.push('closed');
  }
  if (type) {
    if (!TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
    clauses.push('project_type = ?');
    params.push(type);
  }
  if (client_id) {
    clauses.push('client_id = ?');
    params.push(Number(client_id));
  }
  if (updated_since) {
    clauses.push('updated_at > ?');
    params.push(updated_since);
  }

  let sql = 'SELECT * FROM projects';
  if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
  sql += ' ORDER BY code COLLATE NOCASE';

  let rows = db.prepare(sql).all(...params);
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((p) => p.code.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle));
  }

  const includeAssignments = include === 'assignments';
  res.json(rows.map((r) => publicProject(r, { includeAssignments })));
});

router.get('/by-code/:code', requireAuthOrApiKey, (req, res) => {
  const row = db.prepare('SELECT * FROM projects WHERE code = ?').get(req.params.code);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(publicProject(row, { includeAssignments: req.query.include === 'assignments' }));
});

router.get('/:id', requireAuthOrApiKey, (req, res) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(publicProject(row, { includeAssignments: req.query.include === 'assignments' }));
});

router.post('/', requireAuth, requireWrite, (req, res) => {
  const { code, name, client_id, project_type, status, site_address, contract_value, start_date, end_date } = req.body;
  if (!code || !code.trim()) return res.status(400).json({ error: 'code is required' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!TYPES.includes(project_type)) return res.status(400).json({ error: 'Invalid project_type' });
  if (status != null && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const existing = db.prepare('SELECT id FROM projects WHERE code = ?').get(code.trim());
  if (existing) return res.status(400).json({ error: 'That project code is already in use' });

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO projects (id, code, name, client_id, project_type, status, site_address, contract_value, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    code.trim(),
    name.trim(),
    client_id || null,
    project_type,
    status || 'tendering',
    site_address || null,
    contract_value ?? null,
    start_date || null,
    end_date || null
  );

  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json(publicProject(row, { includeAssignments: true }));
});

router.patch('/:id', requireAuth, requireWrite, (req, res) => {
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { code, name, client_id, project_type, status, site_address, contract_value, start_date, end_date } = req.body;
  if (project_type != null && !TYPES.includes(project_type)) return res.status(400).json({ error: 'Invalid project_type' });
  if (status != null && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  let nextCode = existing.code;
  if (code !== undefined) {
    nextCode = code.trim();
    if (!nextCode) return res.status(400).json({ error: 'code is required' });
    const clash = db.prepare('SELECT id FROM projects WHERE code = ? AND id != ?').get(nextCode, existing.id);
    if (clash) return res.status(400).json({ error: 'That project code is already in use' });
  }

  db.prepare(
    `UPDATE projects SET
       code = ?, name = ?, client_id = ?, project_type = ?, status = ?, site_address = ?, contract_value = ?,
       start_date = ?, end_date = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    nextCode,
    name ?? existing.name,
    client_id !== undefined ? client_id : existing.client_id,
    project_type ?? existing.project_type,
    status ?? existing.status,
    site_address !== undefined ? site_address : existing.site_address,
    contract_value !== undefined ? contract_value : existing.contract_value,
    start_date !== undefined ? start_date : existing.start_date,
    end_date !== undefined ? end_date : existing.end_date,
    existing.id
  );

  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(existing.id);
  res.json(publicProject(row, { includeAssignments: true }));
});

router.post('/:id/assignments', requireAuth, requireWrite, (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });

  const { person_id, role } = req.body;
  if (!ASSIGNMENT_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const person = db.prepare('SELECT id FROM people WHERE id = ?').get(person_id);
  if (!person) return res.status(400).json({ error: 'Unknown person' });

  try {
    db.prepare('INSERT INTO project_assignments (project_id, person_id, role) VALUES (?, ?, ?)').run(project.id, person_id, role);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(400).json({ error: 'That person already holds that role on this project' });
    throw e;
  }

  res.status(201).json(loadAssignments(project.id));
});

router.delete('/:id/assignments/:assignmentId', requireAuth, requireWrite, (req, res) => {
  db.prepare('DELETE FROM project_assignments WHERE id = ? AND project_id = ?').run(Number(req.params.assignmentId), req.params.id);
  res.status(204).end();
});

export default router;
