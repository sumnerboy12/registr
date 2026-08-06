import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// One row per job_type/status combination actually present, not a dense
// grid — the client fills in zeroes for combinations with no jobs (see
// JobValueReportPage.tsx), so an empty combination just costs nothing here
// rather than a COALESCE/CROSS JOIN over every possible pairing.
router.get('/job-value', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT job_type, status, COUNT(*) AS count, COALESCE(SUM(value), 0) AS total_value
       FROM jobs
       GROUP BY job_type, status
       ORDER BY job_type, status`
    )
    .all();
  res.json(rows);
});

export default router;
