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

// Job codes: generateJobCode (routes/jobs.js) used to number each job type
// independently per year, so e.g. a Contract and a Minor Works job created
// around the same time could both land on "001" — never a literal duplicate
// (the M/R letter still makes the full code unique) but confusing, and no
// longer how new codes are assigned now that the generator draws from one
// shared per-year sequence across all types. Data-only fix, not a schema
// change: Contract numbers are authoritative and never touched; any Minor
// Works/Remedial job whose number collides with a Contract job (or, once
// this has run once, with another Minor Works/Remedial job) of the same
// year is renumbered to the next free number for that year, oldest job
// first. Self-stabilizing — once every number is unique a later run finds
// nothing left to reassign, so this is safe to leave running on every boot
// rather than needing its own one-off "has this run" flag.
{
  const codeRows = db.prepare("SELECT id, code, job_type FROM jobs WHERE code IS NOT NULL ORDER BY created_at").all();
  // Matches the YYXXX/CYYXXX/MYYXXX/RYYXXX scheme (the leading letter
  // optional, to also catch Contract's old unprefixed codes below) —
  // legacy codes (e.g. a bare 4-digit "2612") don't fit this shape and are
  // left alone, same as generateJobCode's own suffix-length check already
  // ignores them.
  const CODE_RE = /^([CMR]?)(\d{2})(\d{3})$/;

  // Contract codes gain their own "C" prefix, same as Minor Works/Remedial
  // already have "M"/"R" — Contract was previously the only type coded with
  // no letter at all.
  const addPrefix = [];
  for (const row of codeRows) {
    const m = CODE_RE.exec(row.code);
    if (!m || row.job_type !== 'contract' || m[1] === 'C') continue;
    addPrefix.push({ id: row.id, newCode: `C${row.code}` });
  }
  if (addPrefix.length > 0) {
    const updateCode = db.prepare('UPDATE jobs SET code = ? WHERE id = ?');
    for (const { id, newCode } of addPrefix) updateCode.run(newCode, id);
    console.log(`[migration] added a "C" prefix to ${addPrefix.length} contract job code(s)`);
    const renamed = new Map(addPrefix.map((u) => [u.id, u.newCode]));
    for (const row of codeRows) if (renamed.has(row.id)) row.code = renamed.get(row.id);
  }

  const claimedByYear = new Map(); // yy -> Set<number>

  for (const row of codeRows) {
    const m = CODE_RE.exec(row.code);
    if (!m || row.job_type !== 'contract') continue;
    const yy = m[2];
    if (!claimedByYear.has(yy)) claimedByYear.set(yy, new Set());
    claimedByYear.get(yy).add(Number(m[3]));
  }

  const renumbers = [];
  for (const row of codeRows) {
    const m = CODE_RE.exec(row.code);
    if (!m || row.job_type === 'contract') continue;
    const [, letter, yy, numStr] = m;
    if (!claimedByYear.has(yy)) claimedByYear.set(yy, new Set());
    const claimed = claimedByYear.get(yy);
    let num = Number(numStr);
    if (claimed.has(num)) {
      num = 1;
      while (claimed.has(num)) num++;
      renumbers.push({ id: row.id, newCode: `${letter}${yy}${String(num).padStart(3, '0')}` });
    }
    claimed.add(num);
  }

  if (renumbers.length > 0) {
    const updateCode = db.prepare('UPDATE jobs SET code = ? WHERE id = ?');
    for (const { id, newCode } of renumbers) updateCode.run(newCode, id);
    console.log(`[migration] renumbered ${renumbers.length} job code(s) to remove cross-type number collisions`);
  }
}

export { dataDir };
export default db;
