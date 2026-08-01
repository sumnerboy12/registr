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

// Schema-evolution migrations (retrofitting columns/tables onto an existing
// database file) go here once registr is actually deployed, guarded by
// PRAGMA table_info checks — same pattern as rostr's db/index.js. Not
// needed yet: pre-launch, schema.sql itself is the source of truth.

export { dataDir };
export default db;
