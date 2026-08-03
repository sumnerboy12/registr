import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireWrite, requireAdmin } from '../middleware/auth.js';
import { requireAuthOrApiKey } from '../middleware/apiKey.js';

const router = Router();

const APPS = ['registr', 'rostr', 'claimr', 'costr'];
const ROLES = ['admin', 'editor', 'readonly'];
const LOGIN_TYPES = ['sso', 'none'];
const EMPLOYMENT_TYPES = ['wage', 'temp', 'salary'];

function withAccess(person) {
  const access = db.prepare('SELECT app, role FROM person_app_access WHERE person_id = ? ORDER BY app').all(person.id);
  return {
    id: person.id,
    name: person.name,
    login_type: person.login_type,
    email: person.email,
    phone: person.phone,
    date_of_birth: person.date_of_birth,
    employment_start_date: person.employment_start_date,
    employment_end_date: person.employment_end_date,
    role: person.role,
    employment_type: person.employment_type,
    active: !!person.active,
    color: person.color,
    notes: person.notes,
    created_at: person.created_at,
    updated_at: person.updated_at,
    app_access: access,
  };
}

router.get('/', requireAuthOrApiKey, (req, res) => {
  const { active, q } = req.query;
  let rows = db.prepare('SELECT * FROM people ORDER BY name COLLATE NOCASE').all();
  if (active === '1') rows = rows.filter((p) => p.active);
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((p) => p.name.toLowerCase().includes(needle) || (p.email || '').toLowerCase().includes(needle));
  }
  res.json(rows.map(withAccess));
});

router.get('/:id', requireAuthOrApiKey, (req, res) => {
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(Number(req.params.id));
  if (!person) return res.status(404).json({ error: 'not found' });
  res.json(withAccess(person));
});

router.post('/', requireAuth, requireWrite, (req, res) => {
  const { name, login_type, email, phone, date_of_birth, employment_start_date, employment_end_date, role, employment_type, color, notes } =
    req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (login_type != null && !LOGIN_TYPES.includes(login_type)) return res.status(400).json({ error: 'Invalid login_type' });
  if (employment_type != null && !EMPLOYMENT_TYPES.includes(employment_type)) {
    return res.status(400).json({ error: 'Invalid employment_type' });
  }

  const nextEmail = email?.trim() || null;
  if (nextEmail) {
    const existing = db.prepare('SELECT id FROM people WHERE email = ? COLLATE NOCASE').get(nextEmail);
    if (existing) return res.status(400).json({ error: 'That email is already registered' });
  }

  const result = db
    .prepare(
      `INSERT INTO people (name, login_type, email, phone, date_of_birth, employment_start_date, employment_end_date, role, employment_type, color, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name.trim(),
      login_type || 'sso',
      nextEmail,
      phone || null,
      date_of_birth || null,
      employment_start_date || null,
      employment_end_date || null,
      role || null,
      employment_type || 'wage',
      color || '#3b82f6',
      notes || null
    );

  const row = db.prepare('SELECT * FROM people WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(withAccess(row));
});

router.patch('/:id', requireAuth, requireWrite, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM people WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const {
    name,
    login_type,
    email,
    phone,
    date_of_birth,
    employment_start_date,
    employment_end_date,
    role,
    employment_type,
    active,
    color,
    notes,
  } = req.body;
  if (login_type != null && !LOGIN_TYPES.includes(login_type)) return res.status(400).json({ error: 'Invalid login_type' });
  if (employment_type != null && !EMPLOYMENT_TYPES.includes(employment_type)) {
    return res.status(400).json({ error: 'Invalid employment_type' });
  }
  // requireAuth checks active on every request — marking yourself inactive
  // would kill your own session with no way to undo it.
  if (id === req.person.id && active === false) {
    return res.status(400).json({ error: "You can't make your own account inactive" });
  }

  let nextEmail = existing.email;
  if (email !== undefined) {
    nextEmail = email?.trim() || null;
    if (nextEmail) {
      const clash = db.prepare('SELECT id FROM people WHERE email = ? COLLATE NOCASE AND id != ?').get(nextEmail, id);
      if (clash) return res.status(400).json({ error: 'That email is already registered' });
    }
  }

  db.prepare(
    `UPDATE people SET
       name = ?, login_type = ?, email = ?, phone = ?, date_of_birth = ?, employment_start_date = ?, employment_end_date = ?, role = ?, employment_type = ?, active = ?, color = ?, notes = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    login_type ?? existing.login_type,
    nextEmail,
    phone !== undefined ? phone : existing.phone,
    date_of_birth !== undefined ? date_of_birth : existing.date_of_birth,
    employment_start_date !== undefined ? employment_start_date : existing.employment_start_date,
    employment_end_date !== undefined ? employment_end_date : existing.employment_end_date,
    role !== undefined ? role : existing.role,
    employment_type ?? existing.employment_type,
    active != null ? (active ? 1 : 0) : existing.active,
    color ?? existing.color,
    notes !== undefined ? notes : existing.notes,
    id
  );

  const row = db.prepare('SELECT * FROM people WHERE id = ?').get(id);
  res.json(withAccess(row));
});

// Granting app access is admin-only. No domain check — M365 already restricts who can complete SSO.
router.post('/:id/app-access', requireAuth, requireAdmin, (req, res) => {
  const personId = Number(req.params.id);
  const person = db.prepare('SELECT id FROM people WHERE id = ?').get(personId);
  if (!person) return res.status(404).json({ error: 'not found' });

  const { app, role } = req.body;
  if (!APPS.includes(app)) return res.status(400).json({ error: 'Invalid app' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  // Demoting yourself off admin is just as much a lockout as revoking
  // outright — only an admin can reach this endpoint, so once you're not one
  // there's no way back in for yourself.
  if (personId === req.person.id && app === 'registr' && role !== 'admin') {
    return res.status(400).json({ error: "You can't demote your own Registr access" });
  }

  db.prepare(
    `INSERT INTO person_app_access (person_id, app, role) VALUES (?, ?, ?)
     ON CONFLICT(person_id, app) DO UPDATE SET role = excluded.role, updated_at = datetime('now')`
  ).run(personId, app, role);

  const access = db.prepare('SELECT app, role FROM person_app_access WHERE person_id = ? ORDER BY app').all(personId);
  res.status(201).json(access);
});

// Blocks revoking your own registr access — the one grant that would lock
// you out of the UI you're doing this from, with no way back in.
router.delete('/:id/app-access/:app', requireAuth, requireAdmin, (req, res) => {
  const personId = Number(req.params.id);
  if (personId === req.person.id && req.params.app === 'registr') {
    return res.status(400).json({ error: "You can't revoke your own Registr access" });
  }
  db.prepare('DELETE FROM person_app_access WHERE person_id = ? AND app = ?').run(personId, req.params.app);
  res.status(204).end();
});

export default router;
