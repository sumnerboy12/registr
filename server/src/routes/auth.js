import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireApiKey } from '../middleware/apiKey.js';
import { isOidcConfigured, buildAuthorizationUrl, handleCallback } from '../lib/oidc.js';
import { hashPassword, verifyPassword } from '../lib/auth.js';

const router = Router();

function publicPerson(person, role) {
  return {
    id: person.id,
    name: person.name,
    email: person.email,
    username: person.username,
    role,
    must_change_password: !!person.must_change_password,
    has_password: !!person.password_hash,
  };
}

// Local username+password login, alongside SSO (see people.password_hash).
// Only works for a person an admin has explicitly set a username and
// password for; everyone else must use SSO.
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });

  const person = db.prepare('SELECT * FROM people WHERE username = ? COLLATE NOCASE').get(String(username).trim());
  if (!person || !person.active || !person.password_hash) return res.status(401).json({ error: 'Invalid username or password' });
  if (!verifyPassword(password, person.password_hash)) return res.status(401).json({ error: 'Invalid username or password' });

  const access = db.prepare("SELECT role FROM person_app_access WHERE person_id = ? AND app = 'registr'").get(person.id);
  if (!access) return res.status(401).json({ error: 'This account has not been granted access to Registr' });

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'login failed' });
    req.session.personId = person.id;
    res.json(publicPerson(person, access.role));
  });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(req.person.id);
  if (!person.password_hash || !current_password || !verifyPassword(current_password, person.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  db.prepare(`UPDATE people SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?`).run(
    hashPassword(new_password),
    person.id
  );
  res.status(204).end();
});

router.get('/oidc/status', (req, res) => {
  res.json({ enabled: isOidcConfigured() });
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
