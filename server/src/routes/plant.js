import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireWrite } from '../middleware/auth.js';
import { requireAuthOrApiKey } from '../middleware/apiKey.js';

const router = Router();

function publicPlant(row) {
  return { ...row, active: !!row.active };
}

router.get('/', requireAuthOrApiKey, (req, res) => {
  const { active, q } = req.query;
  let rows = db.prepare('SELECT * FROM plant ORDER BY name COLLATE NOCASE').all();
  if (active === '1') rows = rows.filter((p) => p.active);
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((p) => p.name.toLowerCase().includes(needle));
  }
  res.json(rows.map(publicPlant));
});

router.get('/:id', requireAuthOrApiKey, (req, res) => {
  const row = db.prepare('SELECT * FROM plant WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(publicPlant(row));
});

router.post('/', requireAuth, requireWrite, (req, res) => {
  const { name, rego, color, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

  const result = db
    .prepare(`INSERT INTO plant (name, rego, color, notes) VALUES (?, ?, ?, ?)`)
    .run(name.trim(), rego || null, color || '#238f0e', notes || null);

  const row = db.prepare('SELECT * FROM plant WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(publicPlant(row));
});

router.patch('/:id', requireAuth, requireWrite, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM plant WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { name, rego, active, color, notes } = req.body;

  db.prepare(
    `UPDATE plant SET
       name = ?, rego = ?, active = ?, color = ?, notes = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    rego !== undefined ? rego : existing.rego,
    active != null ? (active ? 1 : 0) : existing.active,
    color ?? existing.color,
    notes !== undefined ? notes : existing.notes,
    id
  );

  const row = db.prepare('SELECT * FROM plant WHERE id = ?').get(id);
  res.json(publicPlant(row));
});

export default router;
