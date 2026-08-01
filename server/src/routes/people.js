import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireWrite, requireAdmin } from '../middleware/auth.js';
import { requireAuthOrApiKey } from '../middleware/apiKey.js';
import { hashPassword } from '../lib/auth.js';

const router = Router();

const APPS = ['registr', 'rostr', 'claimr', 'costr'];
const ROLES = ['admin', 'editor', 'readonly'];
const LOGIN_TYPES = ['sso', 'local', 'none'];

function withAccess(person) {
  const access = db.prepare('SELECT app, role FROM person_app_access WHERE person_id = ? ORDER BY app').all(person.id);
  return {
    id: person.id,
    name: person.name,
    login_type: person.login_type,
    email: person.email,
    username: person.username,
    phone: person.phone,
    date_of_birth: person.date_of_birth,
    employment_start_date: person.employment_start_date,
    role: person.role,
    billable: !!person.billable,
    active: !!person.active,
    color: person.color,
    notes: person.notes,
    // Never the hash itself — just whether a local password login exists,
    // so the UI can offer "set/reset password" vs. "change password".
    has_password: !!person.password_hash,
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
  const { name, login_type, email, username, phone, date_of_birth, employment_start_date, role, billable, color, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (login_type != null && !LOGIN_TYPES.includes(login_type)) return res.status(400).json({ error: 'Invalid login_type' });

  const nextEmail = email?.trim() || null;
  if (nextEmail) {
    const existing = db.prepare('SELECT id FROM people WHERE email = ? COLLATE NOCASE').get(nextEmail);
    if (existing) return res.status(400).json({ error: 'That email is already registered' });
  }

  const nextUsername = username?.trim() || null;
  if (nextUsername) {
    const usernameTaken = db.prepare('SELECT id FROM people WHERE username = ? COLLATE NOCASE').get(nextUsername);
    if (usernameTaken) return res.status(400).json({ error: 'That username is already taken' });
  }

  const result = db
    .prepare(
      `INSERT INTO people (name, login_type, email, username, phone, date_of_birth, employment_start_date, role, billable, color, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name.trim(),
      login_type || 'sso',
      nextEmail,
      nextUsername,
      phone || null,
      date_of_birth || null,
      employment_start_date || null,
      role || null,
      billable === false ? 0 : 1,
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

  const { name, login_type, email, username, phone, date_of_birth, employment_start_date, role, billable, active, color, notes } = req.body;
  if (login_type != null && !LOGIN_TYPES.includes(login_type)) return res.status(400).json({ error: 'Invalid login_type' });
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

  let nextUsername = existing.username;
  if (username !== undefined) {
    nextUsername = username?.trim() || null;
    if (nextUsername) {
      const clash = db.prepare('SELECT id FROM people WHERE username = ? COLLATE NOCASE AND id != ?').get(nextUsername, id);
      if (clash) return res.status(400).json({ error: 'That username is already taken' });
    }
  }

  // Clearing username drops the login it's tied to — a leftover hash with no
  // username would just be inert clutter.
  const clearingUsername = existing.username && !nextUsername;

  db.prepare(
    `UPDATE people SET
       name = ?, login_type = ?, email = ?, username = ?, phone = ?, date_of_birth = ?, employment_start_date = ?, role = ?, billable = ?, active = ?, color = ?, notes = ?,
       password_hash = ?, must_change_password = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    login_type ?? existing.login_type,
    nextEmail,
    nextUsername,
    phone !== undefined ? phone : existing.phone,
    date_of_birth !== undefined ? date_of_birth : existing.date_of_birth,
    employment_start_date !== undefined ? employment_start_date : existing.employment_start_date,
    role !== undefined ? role : existing.role,
    billable != null ? (billable ? 1 : 0) : existing.billable,
    active != null ? (active ? 1 : 0) : existing.active,
    color ?? existing.color,
    notes !== undefined ? notes : existing.notes,
    clearingUsername ? null : existing.password_hash,
    clearingUsername ? 0 : existing.must_change_password,
    id
  );

  const row = db.prepare('SELECT * FROM people WHERE id = ?').get(id);
  res.json(withAccess(row));
});

// Sets/resets a person's local password — admin-only. Requires username first,
// since login looks accounts up by username, not email.
router.post('/:id/set-password', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const person = db.prepare('SELECT id, username FROM people WHERE id = ?').get(id);
  if (!person) return res.status(404).json({ error: 'not found' });
  if (!person.username) return res.status(400).json({ error: 'Set a username before adding a local password login' });

  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  db.prepare(`UPDATE people SET password_hash = ?, must_change_password = 1, updated_at = datetime('now') WHERE id = ?`).run(
    hashPassword(password),
    id
  );
  res.status(204).end();
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
    return res.status(400).json({ error: "You can't demote your own registr access" });
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
    return res.status(400).json({ error: "You can't revoke your own registr access" });
  }
  db.prepare('DELETE FROM person_app_access WHERE person_id = ? AND app = ?').run(personId, req.params.app);
  res.status(204).end();
});

export default router;
