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

// available_for_scheduling renamed to billable — must run before schema.exec()
// below, since CREATE TABLE IF NOT EXISTS people is a no-op on an existing file.
if (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'people'").get()) {
  const peopleColumnsPre = db.prepare('PRAGMA table_info(people)').all().map((c) => c.name);
  if (peopleColumnsPre.includes('available_for_scheduling') && !peopleColumnsPre.includes('billable')) {
    db.exec('ALTER TABLE people RENAME COLUMN available_for_scheduling TO billable');
  }
}

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Future schema-evolution migrations (retrofitting columns/tables onto an
// existing database file) go here, guarded by PRAGMA table_info checks —
// same pattern as rostr's db/index.js.

// Swatch colour, added after people/clients already existed (see PersonModal.tsx/ClientModal.tsx).
const peopleColumns = db.prepare('PRAGMA table_info(people)').all().map((c) => c.name);
if (!peopleColumns.includes('color')) {
  db.exec("ALTER TABLE people ADD COLUMN color TEXT NOT NULL DEFAULT '#3b82f6'");
}
const clientColumns = db.prepare('PRAGMA table_info(clients)').all().map((c) => c.name);
if (!clientColumns.includes('color')) {
  db.exec("ALTER TABLE clients ADD COLUMN color TEXT NOT NULL DEFAULT '#22c55e'");
}

export { dataDir };
export default db;
