import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireWrite, requireAdmin } from '../middleware/auth.js';
import { requireAuthOrApiKey } from '../middleware/apiKey.js';
import { isAllowedEmailDomain, allowedEmailDomainList } from '../lib/email.js';
import { hashPassword } from '../lib/auth.js';

const router = Router();

const APPS = ['registr', 'rostr', 'claimr', 'costr'];
const ROLES = ['admin', 'editor', 'readonly'];

function withAccess(person) {
  const access = db.prepare('SELECT app, role FROM person_app_access WHERE person_id = ? ORDER BY app').all(person.id);
  return {
    id: person.id,
    name: person.name,
    email: person.email,
    phone: person.phone,
    role_default: person.role_default,
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
    rows = rows.filter((p) => p.name.toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle));
  }
  res.json(rows.map(withAccess));
});

router.get('/:id', requireAuthOrApiKey, (req, res) => {
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(Number(req.params.id));
  if (!person) return res.status(404).json({ error: 'not found' });
  res.json(withAccess(person));
});

router.post('/', requireAuth, requireWrite, (req, res) => {
  const { name, email, phone, role_default, billable, color, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const nextEmail = email?.trim();
  if (!nextEmail) return res.status(400).json({ error: 'email is required' });

  const existing = db.prepare('SELECT id FROM people WHERE email = ? COLLATE NOCASE').get(nextEmail);
  if (existing) return res.status(400).json({ error: 'That email is already registered' });

  const result = db
    .prepare(
      `INSERT INTO people (name, email, phone, role_default, billable, color, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(name.trim(), nextEmail, phone || null, role_default || null, billable === false ? 0 : 1, color || '#3b82f6', notes || null);

  const row = db.prepare('SELECT * FROM people WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(withAccess(row));
});

router.patch('/:id', requireAuth, requireWrite, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM people WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { name, email, phone, role_default, billable, active, color, notes } = req.body;
  let nextEmail = existing.email;
  if (email !== undefined) {
    nextEmail = email?.trim();
    if (!nextEmail) return res.status(400).json({ error: 'email is required' });
    const clash = db.prepare('SELECT id FROM people WHERE email = ? COLLATE NOCASE AND id != ?').get(nextEmail, id);
    if (clash) return res.status(400).json({ error: 'That email is already registered' });
  }

  db.prepare(
    `UPDATE people SET
       name = ?, email = ?, phone = ?, role_default = ?, billable = ?, active = ?, color = ?, notes = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    nextEmail,
    phone !== undefined ? phone : existing.phone,
    role_default !== undefined ? role_default : existing.role_default,
    billable != null ? (billable ? 1 : 0) : existing.billable,
    active != null ? (active ? 1 : 0) : existing.active,
    color ?? existing.color,
    notes !== undefined ? notes : existing.notes,
    id
  );

  const row = db.prepare('SELECT * FROM people WHERE id = ?').get(id);
  res.json(withAccess(row));
});

// Sets (or replaces) a person's local login password — the break-glass path
// alongside SSO. Admin-only, same bar as granting app access. Forces a
// change on next login, same as rostr's admin-driven password reset.
router.post('/:id/set-password', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const person = db.prepare('SELECT id FROM people WHERE id = ?').get(id);
  if (!person) return res.status(404).json({ error: 'not found' });

  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  db.prepare(`UPDATE people SET password_hash = ?, must_change_password = 1, updated_at = datetime('now') WHERE id = ?`).run(
    hashPassword(password),
    id
  );
  res.status(204).end();
});

// App access is admin-only: granting sign-in rights to rostr/claimr/costr/
// registr itself is a higher bar than editing someone's phone number. People
// can carry any email (subcontractors, clients' own staff, etc.), but only a
// waymanroofing address can ever be granted login rights — SSO itself
// wouldn't let anyone else complete the flow anyway.
router.post('/:id/app-access', requireAuth, requireAdmin, (req, res) => {
  const personId = Number(req.params.id);
  const person = db.prepare('SELECT id, email FROM people WHERE id = ?').get(personId);
  if (!person) return res.status(404).json({ error: 'not found' });
  if (!isAllowedEmailDomain(person.email)) {
    return res.status(400).json({ error: `Only an email on ${allowedEmailDomainList()} can be granted app access` });
  }

  const { app, role } = req.body;
  if (!APPS.includes(app)) return res.status(400).json({ error: 'Invalid app' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });

  db.prepare(
    `INSERT INTO person_app_access (person_id, app, role) VALUES (?, ?, ?)
     ON CONFLICT(person_id, app) DO UPDATE SET role = excluded.role, updated_at = datetime('now')`
  ).run(personId, app, role);

  const access = db.prepare('SELECT app, role FROM person_app_access WHERE person_id = ? ORDER BY app').all(personId);
  res.status(201).json(access);
});

router.delete('/:id/app-access/:app', requireAuth, requireAdmin, (req, res) => {
  const personId = Number(req.params.id);
  db.prepare('DELETE FROM person_app_access WHERE person_id = ? AND app = ?').run(personId, req.params.app);
  res.status(204).end();
});

export default router;
