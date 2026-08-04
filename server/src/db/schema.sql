-- registr is the system of record for job identity, plus the people,
-- clients and plant that hang off it. Downstream apps store only a foreign
-- reference.

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  -- 'sso'/'none' — explicit, since email can't imply it: a 'none' person
  -- still carries an email (for schedules/notifications), same as 'sso'.
  login_type TEXT NOT NULL DEFAULT 'sso' CHECK (login_type IN ('sso', 'none')),
  -- SSO identity + cross-app lookup key (see routes/auth.js's /check).
  email TEXT UNIQUE COLLATE NOCASE,
  phone TEXT,
  date_of_birth TEXT,
  employment_start_date TEXT,
  employment_end_date TEXT,
  -- Free-text job title, distinct from job_assignments.role (per-job).
  role TEXT,
  -- Employment classification — registr is just the master list of WRS
  -- employees; whether someone actually shows up in rostr's job scheduling
  -- is rostr's own local call (see rostr's people.in_scheduling), not this.
  employment_type TEXT NOT NULL DEFAULT 'wage' CHECK (employment_type IN ('wage', 'temp', 'salary')),
  active INTEGER NOT NULL DEFAULT 1,
  -- Swatch colour rostr uses to identify this person on the Schedule.
  color TEXT NOT NULL DEFAULT '#3b82f6',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Which apps a person can sign into, and their role — see /api/v1/auth/check.
CREATE TABLE IF NOT EXISTS person_app_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  app TEXT NOT NULL CHECK (app IN ('registr', 'rostr', 'claimr', 'costr')),
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'readonly')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(person_id, app)
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'direct' CHECK (type IN ('main_contractor', 'direct', 'residential')),
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  accounts_email TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  -- Swatch colour rostr uses to identify this client's jobs on the Schedule.
  color TEXT NOT NULL DEFAULT '#22c55e',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- WRS-owned equipment/machinery only — hired-in gear is a rostr-only
-- concept (tied to a specific job and hire company) with no reason to be
-- WRS master data, so it never lives here; see rostr's plant.source.
CREATE TABLE IF NOT EXISTS plant (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  rego TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  -- Swatch colour rostr uses to identify this plant on the Schedule.
  color TEXT NOT NULL DEFAULT '#238f0e',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- TEXT (UUID) primary key — stays stable across renumbering, unguessable across apps.
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  -- Human code (e.g. "2601", "M2601" — see generateJobCode in routes/jobs.js).
  -- Never the join key internally — always join on id — but it is how the
  -- API/UI address a job in a URL (GET /by-code/:code, /jobs/:code client-side),
  -- so it has to stay unique and, once assigned, immutable (see routes/jobs.js).
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  -- Free-text fallback when no client_id is picked from the list (e.g. a
  -- prospective client not yet in Clients) — cleared once a real client is
  -- linked (see routes/jobs.js).
  client_name TEXT,
  -- This job's own contact — set regardless of whether client_id or
  -- client_name is used; independent of the linked Client's own contact
  -- fields, since a job's actual site contact can differ.
  contact_name TEXT,
  contact_email TEXT,
  job_type TEXT NOT NULL CHECK (job_type IN ('contract', 'minor_works')),
  status TEXT NOT NULL DEFAULT 'tendering'
    CHECK (status IN ('tendering', 'awarded', 'active', 'on_hold', 'practical_completion', 'awaiting_retentions', 'closed', 'lost')),
  site_address TEXT,
  -- Optional regardless of type — typically blank while a job's still
  -- tendering, but nothing stops a minor works job from carrying one too.
  value REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Join table so roles can grow without migrations; not a "one PM" constraint.
CREATE TABLE IF NOT EXISTS job_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('project_manager', 'site_supervisor', 'estimator', 'qs')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(job_id, person_id, role)
);

-- Server-to-server credentials, one per consuming app. Only the hash is stored.
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app TEXT NOT NULL CHECK (app IN ('rostr', 'claimr', 'costr')),
  label TEXT,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_person_app_access_person ON person_app_access(person_id);
CREATE INDEX IF NOT EXISTS idx_person_app_access_app ON person_app_access(app);
CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_updated ON jobs(updated_at);
CREATE INDEX IF NOT EXISTS idx_job_assignments_job ON job_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_person ON job_assignments(person_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_app ON api_keys(app);
