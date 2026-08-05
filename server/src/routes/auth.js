import crypto from 'node:crypto';
import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireApiKey } from '../middleware/apiKey.js';
import { isOidcConfigured, buildAuthorizationUrl, handleCallback } from '../lib/oidc.js';

const router = Router();

function publicPerson(person, role) {
  return { id: person.id, name: person.name, email: person.email, role };
}

function safeCompare(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// The only non-SSO way in: a single hardcoded break-glass admin login,
// password set by ADMIN_PASSWORD — not a person record, so it's unaffected
// by anything that happens in People. Disabled entirely if unset.
router.post('/admin-login', (req, res) => {
  if (!process.env.ADMIN_PASSWORD) return res.status(503).json({ error: 'Admin login is not configured on this server' });

  const { password } = req.body;
  if (!password || !safeCompare(password, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'login failed' });
    req.session.breakGlassAdmin = true;
    res.json(publicPerson({ id: null, name: 'Admin', email: null }, 'admin'));
  });
});

router.get('/status', (req, res) => {
  res.json({ oidcEnabled: isOidcConfigured(), adminLoginEnabled: Boolean(process.env.ADMIN_PASSWORD) });
});

router.get('/oidc/login', async (req, res) => {
  if (!isOidcConfigured()) return res.status(503).json({ error: 'OIDC is not configured' });
  try {
    const { url, state, nonce, codeVerifier } = await buildAuthorizationUrl();
    req.session.oidc = { state, nonce, codeVerifier };
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Failed to start sign-in' });
      res.redirect(url);
    });
  } catch (e) {
    console.error('OIDC login failed:', e);
    res.status(500).json({ error: 'Failed to start sign-in' });
  }
});

// A verified email must match an existing, active person who's been granted
// access to registr specifically (person_app_access app='registr') — SSO is
// a second door into an account an admin already provisioned, not
// self-provisioning.
router.get('/oidc/callback', async (req, res) => {
  const saved = req.session.oidc;
  delete req.session.oidc;
  if (!saved) return res.redirect('/login?error=oidc_expired');

  try {
    const currentUrl = new URL(process.env.OIDC_REDIRECT_URI);
    currentUrl.search = new URL(req.originalUrl, 'http://placeholder').search;
    const claims = await handleCallback(currentUrl, saved);
    const email = claims?.email || claims?.preferred_username;
    if (!email) return res.redirect('/login?error=oidc_no_email');

    const person = db.prepare('SELECT * FROM people WHERE email = ? COLLATE NOCASE').get(String(email).trim());
    if (!person || !person.active) return res.redirect('/login?error=oidc_no_account');

    const access = db.prepare("SELECT role FROM person_app_access WHERE person_id = ? AND app = 'registr'").get(person.id);
    if (!access) return res.redirect('/login?error=oidc_no_access');

    req.session.regenerate((err) => {
      if (err) return res.redirect('/login?error=oidc_failed');
      req.session.personId = person.id;
      res.redirect('/');
    });
  } catch (e) {
    console.error('OIDC callback failed:', e);
    res.redirect('/login?error=oidc_failed');
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json(publicPerson(req.person, req.registrRole));
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

// The integration point for rostr/claimr/costr: each app does its own M365
// OIDC handshake, then calls this (server-to-server, with its API key) to
// ask whether the signed-in email may use *that* app, and with what role —
// registr never sees a consuming app's login traffic directly.
router.get('/check', requireApiKey, (req, res) => {
  const email = String(req.query.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email is required' });

  const person = db.prepare('SELECT * FROM people WHERE email = ? COLLATE NOCASE').get(email);
  if (!person || !person.active) return res.status(404).json({ authorized: false });

  const access = db.prepare('SELECT role FROM person_app_access WHERE person_id = ? AND app = ?').get(person.id, req.consumingApp);
  if (!access) return res.status(404).json({ authorized: false });

  res.json({
    authorized: true,
    role: access.role,
    person: { id: person.id, name: person.name, email: person.email },
  });
});

export default router;
