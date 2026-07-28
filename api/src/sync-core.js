'use strict'

/**
 * Server port of the reconciliation decisions the push/pull endpoints need
 * (PHASE2.md §6.2, §11.2, §11.3). Kept in lockstep with the client's pure
 * module `src/domain/sync.ts` — the client and server MUST agree on the LWW /
 * delete-wins / cursor-staleness rules, so any change here changes there too.
 * The client's `sync.test.ts` is the shared specification for this logic.
 */

const TOMBSTONE_TTL_DAYS = 90
const MS_PER_DAY = 86_400_000
const SYNC_PAGE_LIMIT = 100

/** Missing/NaN version means "never synced" → sorts below any real version. */
function versionOf(r) {
  return r && Number.isFinite(r.version) ? r.version : 0
}

function isTombstone(r) {
  return !!(r && r.deletedAt)
}

/**
 * Server-authoritative accept/reject for one pushed round. `incoming.version`
 * is the client's base version; `stored` is the current Cosmos doc or null.
 * Mirrors `decidePush` in src/domain/sync.ts.
 */
function decidePush(incoming, stored) {
  const incomingDeleted = isTombstone(incoming)
  if (!stored) {
    return { accepted: true, version: 1, deleted: incomingDeleted }
  }

  const storedV = versionOf(stored)
  const storedDeleted = isTombstone(stored)
  const base = versionOf(incoming)

  if (incomingDeleted) {
    if (storedDeleted) {
      // Idempotent re-delete (lost-ack retry): keep the version steady.
      return { accepted: true, version: storedV, deleted: true }
    }
    // Delete wins over a same-or-older edit; never resurrected later (§11.2).
    if (base <= storedV) return { accepted: true, version: storedV + 1, deleted: true }
    return { accepted: false, version: storedV, deleted: false }
  }

  if (storedDeleted) {
    // An edit must never un-delete a tombstone (§11.2).
    return { accepted: false, version: storedV, deleted: true }
  }
  if (base === storedV) return { accepted: true, version: storedV + 1, deleted: false }
  // Stale base — a newer version exists server-side; reject → client pulls.
  return { accepted: false, version: storedV, deleted: false }
}

/** A pull cursor older than the tombstone TTL must full-resync (§11.3). */
function isCursorStale(sinceMs, nowMs, ttlDays = TOMBSTONE_TTL_DAYS) {
  if (!Number.isFinite(sinceMs) || sinceMs <= 0) return false
  return nowMs - sinceMs > ttlDays * MS_PER_DAY
}

/** Per-item Cosmos ttl (seconds) so a tombstone GCs ttlDays after deletedAt. */
function tombstoneTtlSeconds(deletedAt, nowMs, ttlDays = TOMBSTONE_TTL_DAYS) {
  const deletedMs = Date.parse(deletedAt)
  const expiryMs = (Number.isFinite(deletedMs) ? deletedMs : nowMs) + ttlDays * MS_PER_DAY
  return Math.max(1, Math.ceil((expiryMs - nowMs) / 1000))
}

module.exports = {
  TOMBSTONE_TTL_DAYS,
  SYNC_PAGE_LIMIT,
  versionOf,
  decidePush,
  isCursorStale,
  tombstoneTtlSeconds,
}
