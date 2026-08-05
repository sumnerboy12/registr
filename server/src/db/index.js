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
// job assignments) — they had no email-based way back in, so 'none'
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

// Project → Job rename: schema.sql now creates `jobs`/`job_assignments`
// instead of `projects`/`project_assignments`, but CREATE TABLE IF NOT
// EXISTS above is a no-op against an existing database — so a deployment
// that already had real jobs ends up with the old (populated) tables
// orphaned alongside the new (empty) ones. Copy any old rows across first,
// so this never silently loses jobs already in production, then drop the
// old tables. The `WHERE id NOT IN` guards make this safe to run more than
// once, though the old tables are gone after the first run regardless.
const hasOldProjectsTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'").get();
if (hasOldProjectsTable) {
  // start_date/end_date/notes aren't copied — the first no longer exists on
  // jobs (see the "Jobs UI redesign" migration below), the second (notes)
  // didn't exist on the old projects table at all. contract_value (old) ->
  // value (new) per the same redesign.
  db.exec(`
    INSERT INTO jobs (id, code, name, client_id, job_type, status, site_address, value, created_at, updated_at)
    SELECT id, code, name, client_id, project_type, status, site_address, contract_value, created_at, updated_at
    FROM projects
    WHERE id NOT IN (SELECT id FROM jobs)
  `);

  const hasOldAssignmentsTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_assignments'")
    .get();
  if (hasOldAssignmentsTable) {
    // role is remapped inline (not just the table/columns) since job_assignments
    // was just freshly created above from the current schema.sql, which only
    // accepts 'site_supervisor' — an unmapped 'foreman' row here would violate
    // that CHECK constraint. See the foreman → site_supervisor migration below
    // for the case where job_assignments already existed with the old constraint.
    db.exec(`
      INSERT INTO job_assignments (id, job_id, person_id, role, created_at)
      SELECT id, project_id, person_id, CASE WHEN role = 'foreman' THEN 'site_supervisor' ELSE role END, created_at
      FROM project_assignments
      WHERE id NOT IN (SELECT id FROM job_assignments)
    `);
    db.exec('DROP TABLE project_assignments');
  }

  db.exec('DROP TABLE projects');
}

// foreman → site_supervisor: same title, different name. job_assignments.role
// carries an inline CHECK constraint, which SQLite bakes into the table at
// creation time — updating schema.sql alone doesn't touch a table that
// already exists, and simply UPDATEing old 'foreman' rows would violate that
// still-attached old constraint. Needs the full rebuild-table procedure,
// same as the people username removal above.
const jobAssignmentsTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'job_assignments'").get();
if (jobAssignmentsTableSql && jobAssignmentsTableSql.sql.includes("'foreman'")) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    CREATE TABLE job_assignments_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('project_manager', 'site_supervisor', 'estimator', 'qs')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(job_id, person_id, role)
    )
  `);
  db.exec(`
    INSERT INTO job_assignments_new (id, job_id, person_id, role, created_at)
    SELECT id, job_id, person_id, CASE WHEN role = 'foreman' THEN 'site_supervisor' ELSE role END, created_at
    FROM job_assignments
  `);
  db.exec('DROP TABLE job_assignments');
  db.exec('ALTER TABLE job_assignments_new RENAME TO job_assignments');
  db.exec('CREATE INDEX IF NOT EXISTS idx_job_assignments_job ON job_assignments(job_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_job_assignments_person ON job_assignments(person_id)');
  db.exec('PRAGMA foreign_keys = ON');
}

// Jobs UI redesign: dropped start/end dates (unused — a job's dates live on
// its rostr phases, not here) and added a Notes field, matching People/
// Clients/Plant. Neither column carries a constraint, so plain ALTER TABLE
// works, same as the billable column removal above.
const jobsColumns = db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name);
if (jobsColumns.includes('start_date')) db.exec('ALTER TABLE jobs DROP COLUMN start_date');
if (jobsColumns.includes('end_date')) db.exec('ALTER TABLE jobs DROP COLUMN end_date');
if (!jobsColumns.includes('notes')) db.exec('ALTER TABLE jobs ADD COLUMN notes TEXT');
// contract_value → value: no longer implies "contract jobs only" — a minor
// works job can carry one too. Not a constrained column, so a plain rename.
if (jobsColumns.includes('contract_value') && !jobsColumns.includes('value')) {
  db.exec('ALTER TABLE jobs RENAME COLUMN contract_value TO value');
}

// Awaiting Retentions / Lost: two new statuses. jobs.status carries an
// inline CHECK constraint, which SQLite bakes into the table at creation
// time — same situation as the job_assignments.role rebuild above, so it
// needs the same full rebuild-table procedure. Runs after the column
// migrations above so jobs is already in its current shape (value, notes,
// no start/end dates) before being copied into the rebuilt table.
const jobsTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'jobs'").get();
if (jobsTableSql && !jobsTableSql.sql.includes('awaiting_retentions')) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    CREATE TABLE jobs_new (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      job_type TEXT NOT NULL CHECK (job_type IN ('contract', 'minor_works')),
      status TEXT NOT NULL DEFAULT 'tendering'
        CHECK (status IN ('tendering', 'awarded', 'active', 'on_hold', 'practical_completion', 'awaiting_retentions', 'closed', 'lost')),
      site_address TEXT,
      value REAL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    INSERT INTO jobs_new (id, code, name, client_id, job_type, status, site_address, value, notes, created_at, updated_at)
    SELECT id, code, name, client_id, job_type, status, site_address, value, notes, created_at, updated_at
    FROM jobs
  `);
  db.exec('DROP TABLE jobs');
  db.exec('ALTER TABLE jobs_new RENAME TO jobs');
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(job_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_updated ON jobs(updated_at)');
  db.exec('PRAGMA foreign_keys = ON');
}

// Free-text client name (used when no client_id is picked) and a job-level
// contact — queried fresh rather than reusing jobsColumns above, since the
// rebuild just above may have replaced the table. Unconstrained columns,
// so plain ALTER TABLE works.
const jobsColumnsAfterRebuild = db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name);
if (!jobsColumnsAfterRebuild.includes('client_name')) db.exec('ALTER TABLE jobs ADD COLUMN client_name TEXT');
if (!jobsColumnsAfterRebuild.includes('contact_name')) db.exec('ALTER TABLE jobs ADD COLUMN contact_name TEXT');
if (!jobsColumnsAfterRebuild.includes('contact_email')) db.exec('ALTER TABLE jobs ADD COLUMN contact_email TEXT');

// Remedial: a third job type (code prefix "R", see generateJobCode in
// routes/jobs.js). job_type's inline CHECK constraint is baked in at
// creation time — same situation as the status rebuild above, so it needs
// the same full rebuild-table procedure. Runs last, using the fully
// current column set (including client_name/contact_name/contact_email
// added just above), so it doesn't need to know the table's older shapes.
const jobsTableSqlForType = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'jobs'").get();
if (jobsTableSqlForType && !jobsTableSqlForType.sql.includes('remedial')) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    CREATE TABLE jobs_new (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      client_name TEXT,
      contact_name TEXT,
      contact_email TEXT,
      job_type TEXT NOT NULL CHECK (job_type IN ('contract', 'minor_works', 'remedial')),
      status TEXT NOT NULL DEFAULT 'tendering'
        CHECK (status IN ('tendering', 'awarded', 'active', 'on_hold', 'practical_completion', 'awaiting_retentions', 'closed', 'lost')),
      site_address TEXT,
      value REAL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    INSERT INTO jobs_new (id, code, name, client_id, client_name, contact_name, contact_email, job_type, status, site_address, value, notes, created_at, updated_at)
    SELECT id, code, name, client_id, client_name, contact_name, contact_email, job_type, status, site_address, value, notes, created_at, updated_at
    FROM jobs
  `);
  db.exec('DROP TABLE jobs');
  db.exec('ALTER TABLE jobs_new RENAME TO jobs');
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(job_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_updated ON jobs(updated_at)');
  db.exec('PRAGMA foreign_keys = ON');
}

export { dataDir };
export default db;
