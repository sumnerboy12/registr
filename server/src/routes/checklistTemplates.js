import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { CHECKLIST_STAGES } from '../lib/checklistStages.js';
import { JOB_TYPES } from '../lib/jobTypes.js';

const router = Router();

function publicTemplate(row) {
  return { ...row, active: !!row.active, internal: !!row.internal };
}

// Every template item, including inactive ones — this is the admin
// management screen's own list (see ChecklistTemplatesPage.tsx), not a
// job-facing view, so inactive items (kept for history, no longer offered
// to new jobs) still need to show up here to be re-enabled or edited.
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM checklist_templates ORDER BY stage, sequence, id').all();
  res.json(rows.map(publicTemplate));
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { stage, label, job_type, internal } = req.body;
  if (!CHECKLIST_STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });
  if (!label || !label.trim()) return res.status(400).json({ error: 'label is required' });
  // job_type is optional — NULL means the item applies to every job type.
  if (job_type != null && !JOB_TYPES.includes(job_type)) return res.status(400).json({ error: 'Invalid job_type' });

  const { n: nextSequence } = db
    .prepare('SELECT COALESCE(MAX(sequence), -1) + 1 AS n FROM checklist_templates WHERE stage = ?')
    .get(stage);
  const result = db
    .prepare('INSERT INTO checklist_templates (stage, job_type, label, sequence, internal) VALUES (?, ?, ?, ?, ?)')
    .run(stage, job_type || null, label.trim(), nextSequence, internal ? 1 : 0);
  res.status(201).json(publicTemplate(db.prepare('SELECT * FROM checklist_templates WHERE id = ?').get(result.lastInsertRowid)));
});

router.patch('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM checklist_templates WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { stage, label, sequence, active, job_type, internal } = req.body;
  if (stage != null && !CHECKLIST_STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });
  if (label !== undefined && !label.trim()) return res.status(400).json({ error: 'label is required' });
  if (job_type != null && !JOB_TYPES.includes(job_type)) return res.status(400).json({ error: 'Invalid job_type' });

  db.prepare(
    `UPDATE checklist_templates SET stage = ?, job_type = ?, label = ?, sequence = ?, active = ?, internal = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(
    stage ?? existing.stage,
    job_type !== undefined ? job_type || null : existing.job_type,
    label !== undefined ? label.trim() : existing.label,
    sequence ?? existing.sequence,
    active != null ? (active ? 1 : 0) : existing.active,
    internal != null ? (internal ? 1 : 0) : existing.internal,
    id
  );
  res.json(publicTemplate(db.prepare('SELECT * FROM checklist_templates WHERE id = ?').get(id)));
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM checklist_templates WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

export default router;
