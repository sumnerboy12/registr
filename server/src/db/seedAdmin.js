import db from './index.js';
import { isAllowedEmailDomain } from '../lib/email.js';
import { hashPassword } from '../lib/auth.js';

// The first admin is granted purely from SEED_ADMIN_EMAIL, and only while
// zero registr admins exist yet, so this is a no-op on every boot after the
// first. SEED_ADMIN_PASSWORD is optional — set it to also give that admin a
// local login (see people.password_hash), so there's a way in before SSO is
// configured, or if it's ever unavailable.
const email = process.env.SEED_ADMIN_EMAIL?.trim();
if (email) {
  const anyAdmin = db.prepare("SELECT 1 FROM person_app_access WHERE app = 'registr' AND role = 'admin'").get();
  if (!anyAdmin) {
    if (!isAllowedEmailDomain(email)) {
      console.warn(`SEED_ADMIN_EMAIL (${email}) is not on the allowed domain — skipping admin bootstrap.`);
    } else {
      let person = db.prepare('SELECT * FROM people WHERE email = ? COLLATE NOCASE').get(email);
      if (!person) {
        const name = process.env.SEED_ADMIN_NAME?.trim() || email.split('@')[0];
        const result = db.prepare('INSERT INTO people (name, email) VALUES (?, ?)').run(name, email);
        person = db.prepare('SELECT * FROM people WHERE id = ?').get(result.lastInsertRowid);
      }
      db.prepare(
        `INSERT INTO person_app_access (person_id, app, role) VALUES (?, 'registr', 'admin')
         ON CONFLICT(person_id, app) DO UPDATE SET role = 'admin', updated_at = datetime('now')`
      ).run(person.id);
      console.log(`Granted registr admin access to ${email}.`);

      const password = process.env.SEED_ADMIN_PASSWORD;
      if (password) {
        db.prepare(`UPDATE people SET password_hash = ?, must_change_password = 1 WHERE id = ?`).run(hashPassword(password), person.id);
        console.log(`Set a temporary password for ${email} — they'll be asked to change it on first login.`);
      }
    }
  }
}
