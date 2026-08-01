-- registr is the system of record for project identity, plus the people and
-- clients that hang off it. Downstream apps store only a foreign reference.

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  -- 'sso'/'local'/'none' — explicit, since email can't imply it: a 'none'
  -- person still carries an email (for schedules/notifications), same as 'sso'.
  login_type TEXT NOT NULL DEFAULT 'sso' CHECK (login_type IN ('sso', 'local', 'none')),
  -- SSO identity + cross-app lookup key (see routes/auth.js's /check). Nullable for local-only accounts.
  email TEXT UNIQUE COLLATE NOCASE,
  -- Local login identity, independent of email. Nullable — most people only use SSO.
  username TEXT UNIQUE COLLATE NOCASE,
  phone TEXT,
  date_of_birth TEXT,
  employment_start_date TEXT,
  -- Free-text job title, distinct from project_assignments.role (per-project).
  role TEXT,
  -- Whether this person's time is chargeable (rostr scheduling).
  billable INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  -- Swatch colour rostr uses to identify this person on the Schedule.
  color TEXT NOT NULL DEFAULT '#3b82f6',
  -- Local password login alongside SSO. Requires username too — login looks accounts up by username.
  password_hash TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
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

-- TEXT (UUID) primary key — stays stable across renumbering, unguessable across apps.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  -- Human code (e.g. "24-118"). Never the join key — always join on id.
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  project_type TEXT NOT NULL CHECK (project_type IN ('contract', 'minor_works')),
  status TEXT NOT NULL DEFAULT 'tendering'
    CHECK (status IN ('tendering', 'awarded', 'active', 'on_hold', 'practical_completion', 'closed')),
  site_address TEXT,
  -- Null for minor works and for jobs still tendering.
  contract_value REAL,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Join table so roles can grow without migrations; not a "one PM" constraint.
CREATE TABLE IF NOT EXISTS project_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('project_manager', 'foreman', 'estimator', 'qs')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, person_id, role)
);

-- Server-to-server credentials, one per consuming app. Only the hash is stored.
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app TEXT NOT NULL CHECK (app IN ('rostr', 'claimr', 'costr')),
  label TEXT,
  key_hash TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_person_app_access_person ON person_app_access(person_id);
CREATE INDEX IF NOT EXISTS idx_person_app_access_app ON person_app_access(app);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(project_type);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at);
CREATE INDEX IF NOT EXISTS idx_project_assignments_project ON project_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_person ON project_assignments(person_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_app ON api_keys(app);
