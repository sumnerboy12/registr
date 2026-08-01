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

export { dataDir };
export default db;
