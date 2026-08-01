import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { generateApiKey, hashApiKey } from '../lib/apiKeys.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const APPS = ['rostr', 'claimr', 'costr'];

function publicKey(row) {
  return {
    id: row.id,
    app: row.app,
    label: row.label,
    active: !!row.active,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
  };
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM api_keys ORDER BY app, created_at').all();
  res.json(rows.map(publicKey));
});

// Plaintext key is only ever returned here, once — only its hash is stored.
router.post('/', (req, res) => {
  const { app, label } = req.body;
  if (!APPS.includes(app)) return res.status(400).json({ error: `app must be one of ${APPS.join(', ')}` });

  const key = generateApiKey();
  const result = db.prepare('INSERT INTO api_keys (app, label, key_hash) VALUES (?, ?, ?)').run(app, label?.trim() || null, hashApiKey(key));

  const row = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...publicKey(row), key });
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { active } = req.body;
  db.prepare('UPDATE api_keys SET active = ? WHERE id = ?').run(active ? 1 : 0, id);

  const row = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id);
  res.json(publicKey(row));
});

export default router;
