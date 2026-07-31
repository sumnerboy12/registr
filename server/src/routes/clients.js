import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireWrite } from '../middleware/auth.js';
import { requireAuthOrApiKey } from '../middleware/apiKey.js';

const router = Router();

const TYPES = ['main_contractor', 'direct', 'residential'];

function publicClient(row) {
  return { ...row, active: !!row.active };
}

router.get('/', requireAuthOrApiKey, (req, res) => {
  const { active, q } = req.query;
  let rows = db.prepare('SELECT * FROM clients ORDER BY name COLLATE NOCASE').all();
  if (active === '1') rows = rows.filter((c) => c.active);
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((c) => c.name.toLowerCase().includes(needle));
  }
  res.json(rows.map(publicClient));
});

router.get('/:id', requireAuthOrApiKey, (req, res) => {
  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(publicClient(row));
});

router.post('/', requireAuth, requireWrite, (req, res) => {
  const { name, type, contact_name, contact_email, contact_phone, accounts_email, color, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (type != null && !TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });

  const result = db
    .prepare(
      `INSERT INTO clients (name, type, contact_name, contact_email, contact_phone, accounts_email, color, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name.trim(),
      type || 'direct',
      contact_name || null,
      contact_email || null,
      contact_phone || null,
      accounts_email || null,
      color || '#22c55e',
      notes || null
    );

  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(publicClient(row));
});

router.patch('/:id', requireAuth, requireWrite, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { name, type, contact_name, contact_email, contact_phone, accounts_email, active, color, notes } = req.body;
  if (type != null && !TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });

  db.prepare(
    `UPDATE clients SET
       name = ?, type = ?, contact_name = ?, contact_email = ?, contact_phone = ?, accounts_email = ?, active = ?, color = ?, notes = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    type ?? existing.type,
    contact_name !== undefined ? contact_name : existing.contact_name,
    contact_email !== undefined ? contact_email : existing.contact_email,
    contact_phone !== undefined ? contact_phone : existing.contact_phone,
    accounts_email !== undefined ? accounts_email : existing.accounts_email,
    active != null ? (active ? 1 : 0) : existing.active,
    color ?? existing.color,
    notes !== undefined ? notes : existing.notes,
    id
  );

  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  res.json(publicClient(row));
});

export default router;
