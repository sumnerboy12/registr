// ThinkSafe is Wayman's H&S system — read-only API access only, no writes.
// Registr polls its site/user lists periodically (see thinksafeSync.js) and
// shows a badge on any job/person matched there. Optional — leave
// THINKSAFE_API_URL/THINKSAFE_API_KEY unset to disable; nothing else breaks.
export function isThinkSafeConfigured() {
  return Boolean(process.env.THINKSAFE_API_URL && process.env.THINKSAFE_API_KEY);
}

// Both /sites and /users take a filter param for a single record, but
// there's no "list everything" endpoint without one — so this walks every
// page of the unfiltered list and matches records against registr's own
// jobs/people locally (see thinksafeSync.js), rather than round-tripping
// once per job/person. Paginated identically on both endpoints, as
// `{ data: [...], pagination: { limit, offset, returned, has_more } }` —
// offset-based, not page-number based (confirmed against live responses).
//
// THINKSAFE_API_URL already includes a path (.../api/v1) — building the
// request with `new URL(path, THINKSAFE_API_URL)` would silently drop that
// path, since a leading slash makes the second arg replace the base's path
// rather than append to it. Concatenating first and parsing the whole
// string avoids that trap.
const PAGE_SIZE = 100;
const MAX_ITEMS = 20_000;

async function listAllThinkSafe(path) {
  const items = [];
  let offset = 0;
  while (items.length < MAX_ITEMS) {
    const url = new URL(`${process.env.THINKSAFE_API_URL}${path}`);
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('offset', String(offset));

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.THINKSAFE_API_KEY}` },
    });
    if (!res.ok) throw new Error(`ThinkSafe ${path} list failed: ${res.status} ${await res.text()}`);

    const body = await res.json();
    const page = body.data ?? [];
    items.push(...page);
    if (!body.pagination?.has_more) return items;
    // Falls back to what was actually returned (or the page size) if the
    // API's own `returned` count is ever missing, so a short/odd page still
    // advances rather than looping on the same offset forever.
    offset += body.pagination?.returned || page.length || PAGE_SIZE;
  }
  // Hits only if has_more keeps reporting true well past a realistic count —
  // a bug on either end, not a real >20,000-item list. Return what was
  // fetched rather than throwing, so a bad last page doesn't wipe out an
  // otherwise-good cache.
  console.warn(`[thinksafe] stopped ${path} after ${MAX_ITEMS} items — pagination may not be converging`);
  return items;
}

export function listThinkSafeSites() {
  return listAllThinkSafe('/sites');
}

export function listThinkSafeUsers() {
  return listAllThinkSafe('/users');
}
