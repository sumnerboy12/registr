import db from '../db/index.js';

// Loads the signed-in person plus their role for registr's own UI
// (person_app_access where app = 'registr'). session.personId is set by the
// OIDC callback; session.breakGlassAdmin is set by /auth/admin-login's hardcoded
// admin path — that one isn't a person record, so it's synthesized here.
export function requireAuth(req, res, next) {
  if (req.session?.breakGlassAdmin) {
    req.person = { id: null, name: 'Admin', email: null };
    req.registrRole = 'admin';
    return next();
  }

  const personId = req.session?.personId;
  if (!personId) return res.status(401).json({ error: 'not authenticated' });

  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(personId);
  if (!person || !person.active) {
    return req.session.destroy(() => res.status(401).json({ error: 'not authenticated' }));
  }

  const access = db.prepare("SELECT role FROM person_app_access WHERE person_id = ? AND app = 'registr'").get(personId);
  if (!access) {
    return req.session.destroy(() => res.status(401).json({ error: 'not authenticated' }));
  }

  req.person = person;
  req.registrRole = access.role;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.registrRole !== 'admin') return res.status(403).json({ error: 'admin access required' });
  next();
}

export function requireWrite(req, res, next) {
  if (req.registrRole === 'readonly') return res.status(403).json({ error: 'read-only access' });
  next();
}
