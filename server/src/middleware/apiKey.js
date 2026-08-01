import db from '../db/index.js';
import { hashApiKey } from '../lib/apiKeys.js';
import { requireAuth } from './auth.js';

// Server-to-server auth for rostr/claimr/costr. Read-only by design — write
// routes never mount this, only requireAuth (registr's own UI) does.
export function requireApiKey(req, res, next) {
  const header = req.headers.authorization || '';
  const key = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!key) return res.status(401).json({ error: 'missing API key' });

  const row = db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(hashApiKey(key));
  if (!row) return res.status(401).json({ error: 'invalid API key' });

  db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(row.id);
  req.consumingApp = row.app;
  next();
}

// GET endpoints are readable by either a signed-in registr session or a
// consuming app's API key — see routes/*.js for which mount this vs.
// requireAuth alone.
export function requireAuthOrApiKey(req, res, next) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return requireApiKey(req, res, next);
  return requireAuth(req, res, next);
}
