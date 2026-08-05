import { isThinkSafeConfigured, listThinkSafeSites, listThinkSafeUsers } from './thinksafeClient.js';

// Job codes / person names present in ThinkSafe — refreshed on a timer
// rather than looked up per request, since neither /sites nor /users has a
// per-record endpoint cheap enough to call for every row on the Jobs/People
// lists (see thinksafeClient.js). Read via hasThinkSafeSite/hasThinkSafeUser/
// getThinkSafeSyncStatus below, from routes/jobs.js and routes/people.js.
// Names are matched case-insensitively and trimmed — ThinkSafe's own
// casing/whitespace habits aren't guaranteed to match registr's.
let siteJobNumbers = new Set();
let userNames = new Set();
let lastSyncedAt = null;
let lastError = null;

export function hasThinkSafeSite(jobCode) {
  return siteJobNumbers.has(jobCode);
}

export function hasThinkSafeUser(personName) {
  return userNames.has(personName.trim().toLowerCase());
}

export function getThinkSafeSyncStatus() {
  return {
    configured: isThinkSafeConfigured(),
    siteCount: siteJobNumbers.size,
    userCount: userNames.size,
    lastSyncedAt,
    lastError,
  };
}

// Site's job-number field is `job_number`, matching /sites?job_number=XXX's
// own query param name; user's name field is plain `name`, matching
// /users?name=XXX's — both confirmed against live responses. Fetched
// together since they're the same external system polled on the same
// schedule (see startThinkSafeSyncScheduler below).
export async function refreshThinkSafeData() {
  if (!isThinkSafeConfigured()) return;
  try {
    const [sites, users] = await Promise.all([listThinkSafeSites(), listThinkSafeUsers()]);
    siteJobNumbers = new Set(sites.map((s) => s.job_number).filter(Boolean));
    userNames = new Set(users.map((u) => u.name?.trim().toLowerCase()).filter(Boolean));
    lastSyncedAt = new Date().toISOString();
    lastError = null;
  } catch (e) {
    lastError = e.message;
    throw e;
  }
}

const SYNC_INTERVAL_MINUTES = 15;

export function startThinkSafeSyncScheduler() {
  if (!isThinkSafeConfigured()) return;

  const run = () => {
    refreshThinkSafeData()
      .then(() => console.log(`[thinksafe sync] ${siteJobNumbers.size} site(s), ${userNames.size} user(s) found`))
      .catch((e) => console.error('[thinksafe sync] failed:', e.message));
  };

  run(); // once immediately on startup, then on the fixed interval
  setInterval(run, SYNC_INTERVAL_MINUTES * 60_000);
}
