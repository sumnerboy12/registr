# Registr

The system of record for job identity, plus the people and clients that
hang off it. Every other internal app — rostr, claimr, costr — stores only a
job/person/client reference back to Registr, rather than keeping its own
copy of that data, and asks Registr whether a signed-in email is allowed
into that app and with what role.

There are a couple of ways to host this — directly on a Windows PC, or as a
Docker container via the command line (any NAS/Linux box). Pick one.

## Option A: Run on a Windows PC (no Docker)

### First-time setup (on the machine that will host this)

Double-click **`install.cmd`**. This installs the server and client
dependencies. Only needs to be done once (or again after pulling code
updates).

### Running it day-to-day

Double-click **`start.cmd`**. It builds the web app and starts one server on
port 4100. Leave the window open — closing it stops the app.

- On the hosting computer: http://localhost:4100
- From any other computer on the office network: `http://<hosting-computer-name-or-IP>:4100`
  (find the IP with `ipconfig` on the hosting machine)

The first time you run this, Windows Firewall may need an inbound rule to let
other computers reach port 4100. As an administrator:

```
netsh advfirewall firewall add rule name="Registr" dir=in action=allow protocol=TCP localport=4100
```

### Data (Windows install)

All data (jobs, people, clients, API keys) lives in a single SQLite file
at `server/data/registr.db`. Back this file up periodically (copy it
somewhere safe) — there is no other copy of the data.

## Option B: Run in Docker via the command line (any NAS/Linux box)

The whole app (API + web client) runs as a single container on port 4100.

### Deploy

1. Copy this whole project folder onto the NAS (e.g. via the NAS's file
   share/SMB, `scp`, or `git clone` if it's in a repo).
2. If rostr/claimr/costr also run in Docker on this same host, create the
   shared network once — `docker network create wayman-apps` — so those
   containers can reach registr by name (e.g. `http://registr:4100`)
   instead of `localhost`, which inside a container means itself.
3. SSH into the NAS, `cd` into the project folder, and run:

   ```
   docker compose up -d --build
   ```

   This builds the image directly on the NAS (so it always matches the NAS's
   CPU architecture — x86_64, ARM, whatever it is) and starts the container
   in the background.
4. Open `http://<nas-ip>:4100` from any computer on the network.

If port 4100 is already used by something else on the NAS, edit the `ports:`
line in `docker-compose.yml` (e.g. `"8080:4100"`) before running the command
above, then browse to that port instead.

### Data (Docker install)

The SQLite database lives in a `data/` folder created next to
`docker-compose.yml` on the NAS (bind-mounted into the container). It
persists across container restarts and rebuilds — back up that `data/`
folder periodically, there is no other copy.

**Schema changes ship with a migration** (see `server/src/db/index.js`) —
Registr is a production system, so a code update never needs the database
wiped or recreated.

### Updating after a code change

```
docker compose up -d --build
```

Rebuilds the image and replaces the running container. The `data/` folder is
untouched, so nothing is lost.

### Stopping

```
docker compose down
```

## Logging in

The app requires a login. There's no zero-config first-run account — before
the very first login, set `ADMIN_PASSWORD` in `server/.env` (see
`server/.env.example`) and restart the app. Enter that password on the
login screen (no username — it's a single account).

This break-glass login isn't tied to any person record, so it's unaffected
by anything you do under People — it's always there as a fallback, on top
of SSO once that's configured (see below). Once SSO is set up, the login
screen leads with "Sign in with SSO" and tucks the admin password form
behind a "Sign in as admin instead" link, so the break-glass path stays out
of the way of routine day-to-day sign-in. Once you're in, add real people
and, from the **Access** button on each SSO person's row, grant or revoke
sign-in to Registr and every other app.

Note: sessions are kept in the server's memory, not the database, so
restarting the app (a rebuild/redeploy, or a Windows reboot) signs everyone
out and they'll need to log in again — nothing else is lost.

You can't lock yourself out of a real person's SSO access — Registr won't
let you revoke or demote your own Registr admin access, or mark your own
account inactive. One of those actions has to come from another admin (or
the break-glass login).

Set `APP_ENV=development` or `APP_ENV=test` in `server/.env` on any
non-production deployment (a staging box, a local dev copy) — the toolbar
and login screen then show a badge so nobody mistakes it for the real
server. Leave it blank (or `production`) on the real deployment.

## How it works

- **Jobs** — every job Registr tracks, identified by a human **code**,
  generated automatically as `YYXX` for Contract jobs (e.g. "2601") or
  `MYYXX` for Minor Works (e.g. "M2601") — `YY` is the year, `XX` the next
  unused number that year, counted separately per type. Only admins can
  override the suggested code, and only while creating the job — both code
  and **type** (Contract or Minor Works) are locked for good as soon as the
  job is saved, for every role including admin. Each job also carries a
  **status** (Tendering / Awarded / Active / On Hold / Practical Completion
  / Closed — Registr never hard-deletes a job, Closed is how one is
  archived), an optional linked client, site address, value and notes,
  plus a list of people **assigned** to it (Project Manager, Site
  Supervisor, Estimator, QS — the same person can hold more than one role).
- **Clients** — the organisations jobs are done for or through. Each has
  a **type** (Main Contractor / Direct / Residential), optional contact and
  accounts/payables details, notes, and a colour (from an 18-colour swatch)
  used by rostr to identify that client's jobs. Inactive clients are hidden
  by default (tick **Show inactive** to see them). **Import**/**Export** work
  from a spreadsheet — see below.
- **People** — Registr's directory: everyone who might be assigned to a
  job, appear in another app, or sign in anywhere. Not everyone needs to
  sign in — see Login type, below. Each person also carries a role (free
  text), phone, date of birth/employment start/end dates, notes, colour, and
  an **employment type** (Wage / Temp / Salary) — a payroll/HR
  classification only; it has no bearing on whether rostr actually schedules
  that person, which is rostr's own separate local flag. Inactive people are
  hidden by default (tick **Show inactive** to see them), and the list can be
  filtered by employment type. **Import**/**Export** work here too; imported
  people default to the **None** login type, since a bulk import is usually
  a contact list, not a batch of new logins.
- **Plant** — Registr's master list of WRS-owned equipment/machinery (name,
  optional rego, notes, colour, active). Hired-in gear is deliberately not
  tracked here — that's a rostr-only concept, tied to a specific job and
  hire company. **Import**/**Export** work the same way as People/Clients.
- **Login type & app access** — every person is either **SSO** (signs in via
  M365, matched by email) or **None** (can't sign in anywhere; an email, if
  set, is only used for notifications). The **Access** button on an SSO
  person's row (admin only) grants or revokes each app's role —
  admin/editor/readonly. The only non-SSO way in is the single break-glass
  admin login (see "Logging in", above) — there's no per-person local
  password.
- **API Keys** (admin only) — the server-to-server credentials rostr, claimr
  and costr use to ask Registr whether a signed-in email is allowed into
  that app. Generate one per app; the plaintext is shown once, at creation.
  Revoking deletes a key permanently.

**Import/Export doubles as backup/restore.** Each entity's Export CSV covers
every field on that entity (not just the obvious ones), so re-importing the
same file reproduces every record faithfully. A row matching an existing
record (by email for People, by name for Clients/Plant) — or an earlier row
in the same paste — is skipped as a duplicate rather than re-created, and
reported separately from actual failures. This isn't a single combined
"whole database" backup: People, Clients and Plant each export/import their
own CSV, and a restore doesn't recreate a record's internal ID or (for
People) its app-access grants — those need re-setting by hand afterwards.

## Signing in with SSO (optional)

The login screen can show a "Sign in with SSO" button backed by any OpenID
Connect provider — Microsoft Entra ID (Azure AD) is a natural fit if your
team already has Microsoft 365 accounts. Without this configured, only the
break-glass admin login shows.

SSO does **not** create people on its own: a matching person must already
exist under **People** with a matching **email** and have been granted
Registr access under **Access** — this keeps provisioning under your
control rather than letting anyone with an org email in.

To set it up:

1. Register an application with your identity provider and set its redirect
   URI to `https://<your-registr-url>/api/auth/oidc/callback` (or
   `http://localhost:4100/api/auth/oidc/callback` for local testing).
2. Copy `server/.env.example` to `server/.env` and fill in
   `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and
   `OIDC_REDIRECT_URI` (see `server/.env.example` for the exact Entra ID
   issuer URL format). Restart the app after saving.
3. Set each person's **email** under People to match their provider account,
   and grant them Registr access.

The break-glass admin login keeps working alongside SSO — useful as a
fallback if the identity provider is ever unreachable.

## Integrating another app (rostr, claimr, costr)

1. Generate an API key for that app from the **API Keys** screen (or, from
   `registr/server`, `npm run create-api-key -- <app>`).
2. Store the plaintext key (shown once) in that app's own server config.
3. That app calls `GET /api/auth/check?email=<email>` with
   `Authorization: Bearer <key>` after its own SSO handshake, and uses the
   returned `{ authorized, role, person }` to decide access — see
   `server/src/routes/auth.js`.
4. The same key also grants access to `POST /api/v1/email/send` (body
   `{ to, subject, text, html }`) and `GET /api/v1/email/status` (→
   `{ configured }`) — registr relays email through its own SMTP account
   (see `SMTP_*` in `server/.env.example`) so consuming apps don't need
   their own. `503` if registr's SMTP isn't configured, `502` if the send
   itself fails — see `server/src/routes/email.js`.

## Development mode

For making code changes, run the server and client separately with live
reload:

```
server\run-dev.cmd
client\run-dev.cmd
```

The client dev server runs on port 5173 and proxies API calls to the server
on port 4100.
