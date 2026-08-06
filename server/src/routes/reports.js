import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { buildJobValueRows } from '../lib/reports/jobValue.js';

const router = Router();

// The client fills in zeroes for job_type/status combinations missing from
// this response (see JobValueReportPage.tsx) — buildJobValueRows only
// returns combinations actually present, not a dense grid.
router.get('/job-value', requireAuth, (req, res) => {
  res.json(buildJobValueRows());
});

export default router;
