import { Router } from 'express';
import { requireApiKey } from '../middleware/apiKey.js';
import { isMailConfigured, sendMail } from '../lib/mailer.js';

// Relays email for rostr/claimr/costr through registr's shared SMTP config,
// so each app doesn't need its own — same API-key auth as /api/auth/check.
const router = Router();
router.use(requireApiKey);

router.get('/status', (req, res) => {
  res.json({ configured: isMailConfigured() });
});

router.post('/send', async (req, res) => {
  const { to, subject, text, html } = req.body;
  if (!to || !subject || (!text && !html)) {
    return res.status(400).json({ error: 'to, subject and (text or html) are required' });
  }
  if (!isMailConfigured()) return res.status(503).json({ error: 'Email is not configured on registr (see server/.env.example)' });

  try {
    await sendMail({ to, subject, text, html });
    res.status(202).json({ sent: true });
  } catch (e) {
    console.error(`Email send failed (${req.consumingApp} -> ${to}):`, e.message);
    res.status(502).json({ error: 'Failed to send email' });
  }
});

export default router;
