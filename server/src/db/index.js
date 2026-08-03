import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'registr.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// registr is in production — every schema.sql change from here needs a
// matching migration below, guarded by PRAGMA table_info checks, same
// pattern as rostr's db/index.js. CREATE TABLE IF NOT EXISTS above is a
// no-op on an existing file, so new/renamed/dropped columns need this.

// Local login removed — replaced by a single hardcoded break-glass admin
// login (ADMIN_PASSWORD env var), not a per-person account. Existing 'local'
// people are deleted outright (cascades to their app access grants and
// project assignments) — they had no email-based way back in, so 'none'
// would just leave dead accounts nobody could ever sign in as again.
// username carries an inline UNIQUE constraint, which SQLite refuses to drop
// via plain ALTER TABLE DROP COLUMN — needs the full rebuild-table procedure.
const peopleColumns = db.prepare('PRAGMA table_info(people)').all().map((c) => c.name);
if (peopleColumns.includes('username') || peopleColumns.includes('password_hash') || peopleColumns.includes('must_change_password')) {
  db.exec("DELETE FROM people WHERE login_type = 'local'");
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    CREATE TABLE people_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      login_type TEXT NOT NULL DEFAULT 'sso' CHECK (login_type IN ('sso', 'none')),
      email TEXT UNIQUE COLLATE NOCASE,
      phone TEXT,
      date_of_birth TEXT,
      employment_start_date TEXT,
      role TEXT,
      billable INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      color TEXT NOT NULL DEFAULT '#3b82f6',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    INSERT INTO people_new (id, name, login_type, email, phone, date_of_birth, employment_start_date, role, billable, active, color, notes, created_at, updated_at)
    SELECT id, name, login_type, email, phone, date_of_birth, employment_start_date, role, billable, active, color, notes, created_at, updated_at FROM people
  `);
  db.exec('DROP TABLE people');
  db.exec('ALTER TABLE people_new RENAME TO people');
  db.exec('PRAGMA foreign_keys = ON');
}

// billable → employment_type: registr is just the master list of WRS
// employees now — whether someone counts toward rostr's job scheduling is
// rostr's own local call (see rostr's people.in_scheduling), not something
// registr tracks. Existing rows all become 'wage' regardless of their old
// billable value — that flag meant "shows up in rostr", not "wage vs
// temp vs salary", so there's no reliable mapping from one to the other;
// re-classify manually as needed.
const peopleColumnsForEmploymentType = db.prepare('PRAGMA table_info(people)').all().map((c) => c.name);
if (peopleColumnsForEmploymentType.includes('billable') && !peopleColumnsForEmploymentType.includes('employment_type')) {
  db.exec(
    "ALTER TABLE people ADD COLUMN employment_type TEXT NOT NULL DEFAULT 'wage' CHECK (employment_type IN ('wage', 'temp', 'salary'))"
  );
  db.exec('ALTER TABLE people DROP COLUMN billable');
}

// New optional field alongside employment_start_date.
const peopleColumnsForEmploymentEnd = db.prepare('PRAGMA table_info(people)').all().map((c) => c.name);
if (!peopleColumnsForEmploymentEnd.includes('employment_end_date')) {
  db.exec('ALTER TABLE people ADD COLUMN employment_end_date TEXT');
}

export { dataDir };
export default db;
