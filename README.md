# Registr

The system of record for project identity, plus the people and clients that
hang off it. Every other internal app — rostr, claimr, costr — stores only a
project/person/client reference back to Registr, rather than keeping its own
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

All data (projects, people, clients, API keys) lives in a single SQLite file
at `server/data/registr.db`. Back this file up periodically (copy it
somewhere safe) — there is no other copy of the data.

## Option B: Run in Docker via the command line (any NAS/Linux box)

The whole app (API + web client) runs as a single container on port 4100.

### Deploy

1. Copy this whole project folder onto the NAS (e.g. via the NAS's file
   share/SMB, `scp`, or `git clone` if it's in a repo).
2. SSH into the NAS, `cd` into the project folder, and run:

   ```
   docker compose up -d --build
   ```

   This builds the image directly on the NAS (so it always matches the NAS's
   CPU architecture — x86_64, ARM, whatever it is) and starts the container
   in the background.
3. Open `http://<nas-ip>:4100` from any computer on the network.

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
`server/.env.example`) and restart the app. Sign in with username `admin`
and that password.

This break-glass login isn't tied to any person record, so it's unaffected
by anything you do under People — it's always there as a fallback, on top
of SSO once that's configured (see below). Once you're in, add real people
and, from the **Access** button on each SSO person's row, grant or revoke
sign-in to Registr and every other app.

Note: sessions are kept in the server's memory, not the database, so
restarting the app (a rebuild/redeploy, or a Windows reboot) signs everyone
out and they'll need to log in again — nothing else is lost.

You can't lock yourself out of a real person's SSO access — Registr won't
let you revoke or demote your own Registr admin access, or mark your own
account inactive. One of those actions has to come from another admin (or
the break-glass login).

## How it works

- **Projects** — every job Registr tracks, identified by a human **code**
  (e.g. "24-118"). Each carries a **type** (Contract or Minor Works), a
  **status** (Tendering / Awarded / Active / On Hold / Practical Completion
  / Closed — Registr never hard-deletes a project, Closed is how one is
  archived), an optional linked client, site address, contract value and
  dates, plus a list of people **assigned** to it (Project Manager, Foreman,
  Estimator, QS — the same person can hold more than one role).
- **Clients** — the organisations projects are done for or through. Each has
  a **type** (Main Contractor / Direct / Residential), optional contact and
  accounts/payables details, and a colour (from an 18-colour swatch) used by
  rostr to identify that client's jobs. **Import**/**Export** work from a
  spreadsheet.
- **People** — Registr's directory: everyone who might be assigned to a
  project, appear in another app, or sign in anywhere. Not everyone needs to
  sign in — see Login type, below. Each person also carries a role (free
  text), phone, date of birth/employment start date, colour, and whether
  they're **billable** (used by rostr's scheduling). **Import**/**Export**
  work here too; imported people default to the **None** login type, since a
  bulk import is usually a contact list, not a batch of new logins.
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
3. That app calls `GET /api/v1/auth/check?email=<email>` with
   `Authorization: Bearer <key>` after its own SSO handshake, and uses the
   returned `{ authorized, role, person }` to decide access — see
   `server/src/routes/auth.js`.

## Development mode

For making code changes, run the server and client separately with live
reload:

```
server\run-dev.cmd
client\run-dev.cmd
```

The client dev server runs on port 5173 and proxies API calls to the server
on port 4100.
