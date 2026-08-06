import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { REPORT_TYPES } from '../lib/reports/index.js';
import { listSchedules, getRawSchedule, createSchedule, updateSchedule, deleteSchedule } from '../lib/scheduledReports.js';
import { fireSchedule } from '../lib/scheduledReportsScheduler.js';
import { isMailConfigured } from '../lib/mailer.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/report-types', (req, res) => {
  res.json(Object.entries(REPORT_TYPES).map(([key, r]) => ({ key, label: r.label })));
});

router.get('/', (req, res) => {
  res.json(listSchedules());
});

router.post('/', (req, res) => {
  const { report_type, enabled, day_of_week, time, period, recipient_person_ids } = req.body;
  try {
    res.status(201).json(createSchedule({ report_type, enabled, day_of_week, time, period, recipient_person_ids }));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { report_type, enabled, day_of_week, time, period, recipient_person_ids } = req.body;
  try {
    const updated = updateSchedule(id, { report_type, enabled, day_of_week, time, period, recipient_person_ids });
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  deleteSchedule(Number(req.params.id));
  res.status(204).end();
});

router.post('/:id/send-now', async (req, res) => {
  const id = Number(req.params.id);
  const schedule = getRawSchedule(id);
  if (!schedule) return res.status(404).json({ error: 'not found' });
  if (!isMailConfigured()) {
    return res.status(503).json({ error: 'Email is not configured (see server/.env.example)' });
  }

  // Deliberately skips shouldFireNow and does not touch last_sent_date — an
  // ad-hoc test send shouldn't suppress or interfere with the real
  // scheduled fire.
  try {
    await fireSchedule(schedule);
    res.json({ sent: true });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

export default router;
