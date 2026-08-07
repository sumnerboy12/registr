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

// checklist_templates.job_type — added after checklist_templates itself had
// already shipped, so CREATE TABLE IF NOT EXISTS above is a no-op against an
// existing db file and the column needs adding by hand.
const checklistTemplateColumns = db.prepare("PRAGMA table_info(checklist_templates)").all().map((c) => c.name);
if (!checklistTemplateColumns.includes('job_type')) {
  db.exec('ALTER TABLE checklist_templates ADD COLUMN job_type TEXT');
}

// job_checklist_items.notes — added after job_checklist_items itself had
// already shipped, same reasoning as job_type above.
const jobChecklistItemColumns = db.prepare("PRAGMA table_info(job_checklist_items)").all().map((c) => c.name);
if (!jobChecklistItemColumns.includes('notes')) {
  db.exec('ALTER TABLE job_checklist_items ADD COLUMN notes TEXT');
}

// job_checklist_items: completed (boolean) -> status (open/in_progress/
// done/not_done), same reasoning as job_type above — backfill from the old
// columns, then drop them now that nothing reads them.
if (!jobChecklistItemColumns.includes('status')) {
  db.exec(`
    ALTER TABLE job_checklist_items ADD COLUMN status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'not_done'));
    ALTER TABLE job_checklist_items ADD COLUMN status_by_person_id INTEGER REFERENCES people(id) ON DELETE SET NULL;
    ALTER TABLE job_checklist_items ADD COLUMN status_by_name TEXT;
    ALTER TABLE job_checklist_items ADD COLUMN status_at TEXT;
    UPDATE job_checklist_items SET
      status = CASE WHEN completed = 1 THEN 'done' ELSE 'open' END,
      status_by_person_id = completed_by_person_id,
      status_by_name = completed_by_name,
      status_at = completed_at;
    ALTER TABLE job_checklist_items DROP COLUMN completed;
    ALTER TABLE job_checklist_items DROP COLUMN completed_by_person_id;
    ALTER TABLE job_checklist_items DROP COLUMN completed_by_name;
    ALTER TABLE job_checklist_items DROP COLUMN completed_at;
  `);
}

// checklist_templates.internal / job_checklist_items.internal — same
// reasoning as job_type/notes above.
if (!checklistTemplateColumns.includes('internal')) {
  db.exec('ALTER TABLE checklist_templates ADD COLUMN internal INTEGER NOT NULL DEFAULT 0');
}
if (!jobChecklistItemColumns.includes('internal')) {
  db.exec('ALTER TABLE job_checklist_items ADD COLUMN internal INTEGER NOT NULL DEFAULT 0');
}

export { dataDir };
export default db;
