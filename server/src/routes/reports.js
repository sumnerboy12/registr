import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { buildJobValueRows } from '../lib/reports/jobValue.js';
import { buildQaOutstandingRows } from '../lib/reports/qaOutstanding.js';
import { JOB_STATUSES } from '../lib/jobStatuses.js';
import { JOB_TYPES } from '../lib/jobTypes.js';

const router = Router();

// The client fills in zeroes for job_type/status combinations missing from
// this response (see JobValueReportPage.tsx) — buildJobValueRows only
// returns combinations actually present, not a dense grid.
router.get('/job-value', requireAuth, (req, res) => {
  res.json(buildJobValueRows());
});

// mine=1 scopes to jobs req.person is the project manager on — correctly
// resolves to zero jobs for a break-glass admin login, which has no
// person_id to ever match an assignment (see buildQaOutstandingRows).
router.get('/qa-checklist', requireAuth, (req, res) => {
  const { status, type, mine } = req.query;
  if (status && !JOB_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (type && !JOB_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
  res.json(buildQaOutstandingRows({ status, jobType: type, mine: mine === '1', pmPersonId: req.person.id }));
});

export default router;
