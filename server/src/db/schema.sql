-- registr is the system of record for project identity, plus the people and
-- clients that hang off it. Every downstream app (rostr, claimr, costr)
-- stores only a project_id/person_id/client_id foreign reference — no
-- duplicated project code, name, client, or staff data anywhere else.

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  -- The identity SSO logs in with when this person has app access — also the
  -- join key every consuming app's OIDC callback uses to ask registr "is this
  -- email allowed in, and as what role?" (see routes/auth.js's /check). Can
  -- be any domain (people.js's POST/PATCH don't restrict it) — only granting
  -- app_access itself is restricted to ALLOWED_EMAIL_DOMAIN, since that's the
  -- only domain that can complete M365 SSO anyway.
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT,
  -- Free-text default job title (e.g. "Foreman", "Estimator") — distinct
  -- from project_assignments.role, which is per-project.
  role_default TEXT,
  -- Whether this person's time is chargeable — rostr uses this to decide
  -- whether to offer them for crew scheduling. A registr-owned property of
  -- the person, not project data, so it lives here rather than duplicated
  -- in rostr.
  billable INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  -- Swatch colour rostr uses to identify this person on the Schedule.
  color TEXT NOT NULL DEFAULT '#3b82f6',
  -- Optional local login, alongside SSO — null means this person can only
  -- sign in via M365. Exists for a break-glass/bootstrap admin path when SSO
  -- isn't configured yet or is unavailable, same as rostr's password login.
  password_hash TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Which apps a person can sign into, and their role once in. All app access
-- control is decided here — each app does its own SSO handshake, then asks
-- registr's /api/v1/auth/check whether the signed-in email is allowed and
-- with what role, rather than keeping its own separate user list.
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

-- TEXT (UUID) primary key, not an autoincrement int — this is the one thing
-- every downstream app stores, so it must stay stable even if the project is
-- renumbered, and must not leak sequential/guessable ids across apps.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  -- Human code (e.g. "24-118"). Editable, unique, but never the join key —
  -- always join on id; code is for humans only.
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

-- Join table rather than columns on projects, so roles can grow without
-- migrations. One person can hold several roles; one role can have several
-- people — "exactly one active PM" is an app-layer concern, not a constraint
-- here.
CREATE TABLE IF NOT EXISTS project_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('project_manager', 'foreman', 'estimator', 'qs')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, person_id, role)
);

-- One row per server-to-server credential, one per consuming app (rostr,
-- claimr, costr). Read-only by design — see middleware/apiKey.js — registr's
-- own UI is the only writer. Only the hash is stored; the plaintext key is
-- shown once at creation time (see db/createApiKey.js).
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
