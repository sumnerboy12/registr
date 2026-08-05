import { Router } from 'express';
import { requireAuth, requireWrite } from '../middleware/auth.js';
import { getThinkSafeSyncStatus, refreshThinkSafeData } from '../lib/thinksafeSync.js';

const router = Router();

// Read-only status (configured/counts/last synced/last error), for a small
// indicator in the Jobs/People toolbars — doesn't trigger a fetch itself.
router.get('/status', requireAuth, (req, res) => {
  res.json(getThinkSafeSyncStatus());
});

// Manual "sync now" — same fetch the background scheduler runs every 15
// minutes (see lib/thinksafeSync.js), just on demand.
router.post('/refresh', requireAuth, requireWrite, async (req, res) => {
  try {
    await refreshThinkSafeData();
    res.json(getThinkSafeSyncStatus());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

export default router;
