import crypto from 'node:crypto';
import db from './index.js';
import { hashPassword } from '../lib/auth.js';

// Zero-config bootstrap, same as rostr: creates a local "admin" login with a
// random temp password if nobody has registr admin access yet.
const anyAdmin = db.prepare("SELECT 1 FROM person_app_access WHERE app = 'registr' AND role = 'admin'").get();
if (!anyAdmin) {
  let person = db.prepare('SELECT * FROM people WHERE username = ? COLLATE NOCASE').get('admin');
  if (!person) {
    const result = db
      .prepare("INSERT INTO people (name, login_type, username, billable) VALUES (?, 'local', ?, 0)")
      .run('Admin', 'admin');
    person = db.prepare('SELECT * FROM people WHERE id = ?').get(result.lastInsertRowid);
  }
  db.prepare(
    `INSERT INTO person_app_access (person_id, app, role) VALUES (?, 'registr', 'admin')
     ON CONFLICT(person_id, app) DO UPDATE SET role = 'admin', updated_at = datetime('now')`
  ).run(person.id);

  const tempPassword = crypto.randomBytes(9).toString('base64url');
  db.prepare(`UPDATE people SET password_hash = ?, must_change_password = 1 WHERE id = ?`).run(hashPassword(tempPassword), person.id);

  console.log('='.repeat(60));
  console.log('Created initial admin login:');
  console.log('  Username: admin');
  console.log(`  Password: ${tempPassword}`);
  console.log("You'll be asked to set a new password on first login.");
  console.log('='.repeat(60));
}
