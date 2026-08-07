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

// Job codes are always a bare YYXXX (e.g. "26001") now, regardless of job
// type — the type is conveyed in the UI by colour (see JOB_TYPE_ROW_TINT in
// JobsPage.tsx), not by a letter baked into the code itself. Converges two
// historical states in one idempotent pass: (a) a type letter still on the
// code (Contract briefly had its own "C", Minor Works "M", Remedial "R"),
// and (b) each type having counted its own number independently per year,
// so e.g. a Contract and a Minor Works job created the same year could both
// be "…001". Contract numbers are treated as authoritative and never
// renumbered; any Minor Works/Remedial job whose number collides with a
// Contract job (or, once this has run once, another Minor Works/Remedial
// job) of the same year is renumbered to the next free number, oldest job
// first. Self-stabilizing — once every code is bare and every number is
// unique, a later run finds nothing left to change, so this is safe to
// leave running on every boot rather than needing its own one-off "has
// this run" flag.
{
  const codeRows = db.prepare("SELECT id, code, job_type FROM jobs WHERE code IS NOT NULL ORDER BY created_at").all();
  // Tolerates an optional leading type letter so this still recognizes
  // codes from either historical state above — legacy codes (e.g. a bare
  // 4-digit "2612") don't fit this shape either way and are left alone,
  // same as generateJobCode's own suffix-length check already ignores them.
  const CODE_RE = /^[CMR]?(\d{2})(\d{3})$/;

  const claimedByYear = new Map(); // yy -> Set<number>
  for (const row of codeRows) {
    const m = CODE_RE.exec(row.code);
    if (!m || row.job_type !== 'contract') continue;
    const yy = m[1];
    if (!claimedByYear.has(yy)) claimedByYear.set(yy, new Set());
    claimedByYear.get(yy).add(Number(m[2]));
  }

  const updates = [];
  for (const row of codeRows) {
    const m = CODE_RE.exec(row.code);
    if (!m) continue;
    const [, yy, numStr] = m;
    let num = Number(numStr);
    if (row.job_type !== 'contract') {
      if (!claimedByYear.has(yy)) claimedByYear.set(yy, new Set());
      const claimed = claimedByYear.get(yy);
      if (claimed.has(num)) {
        num = 1;
        while (claimed.has(num)) num++;
      }
      claimed.add(num);
    }
    const bareCode = `${yy}${String(num).padStart(3, '0')}`;
    if (bareCode !== row.code) updates.push({ id: row.id, newCode: bareCode });
  }

  if (updates.length > 0) {
    const updateCode = db.prepare('UPDATE jobs SET code = ? WHERE id = ?');
    for (const { id, newCode } of updates) updateCode.run(newCode, id);
    console.log(`[migration] normalized ${updates.length} job code(s) to a bare, cross-type-unique YYXXX`);
  }
}

export { dataDir };
export default db;
