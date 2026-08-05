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

// No migrations below — the production db was reset to empty alongside this
// commit, so schema.sql is the whole story again. Once real data has landed
// on top of it, resume the old pattern: every schema.sql change needs a
// matching migration here, guarded by a PRAGMA table_info/sqlite_master
// check, since CREATE TABLE IF NOT EXISTS above is a no-op against an
// existing file.

export { dataDir };
export default db;
