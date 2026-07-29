/**
 * Pure reconciliation logic for Phase 2 sync (PHASE2.md §6, §11).
 *
 * This is the correctness core of the phase and, per §9, is deliberately free
 * of any Dexie/IndexedDB/network dependency so the last-write-wins, delete-wins,
 * tombstone, compare-and-clear, and cursor-staleness rules can be unit-tested in
 * isolation. The Dexie-facing sync engine (client) and the Azure Functions
 * endpoints (server) both compose these decisions; the server carries a parallel
 * JS port of {@link decidePush} / {@link isCursorStale}.
 *
 * Terminology:
 *  - **version** — a monotonic integer the *server* stamps on every accepted
 *    write. It, not the client wall-clock (`updatedAt`), decides the LWW winner
 *    (§11.1). A never-synced record has no version (treated as 0).
 *  - **base version** — the version a client last saw for a record; the server
 *    accepts a normal edit only if the base still matches the stored version
 *    (optimistic concurrency).
 *  - **tombstone** — a soft-deleted record (`deletedAt` set). Delete wins over a
 *    concurrent edit at the same-or-older base (§11.2) and is never resurrected.
 */
import type { Round } from '@/db/types'

/** Tombstones are retained 90 days, then GC'd; older cursors force a full resync (§11.3). */
export const TOMBSTONE_TTL_DAYS = 90
const MS_PER_DAY = 86_400_000

/** Max records per push/pull request; larger sets page (§11.8). */
export const SYNC_PAGE_LIMIT = 100

/** A round as it travels over the wire — local-only bookkeeping stripped. */
export type SyncRound = Omit<Round, 'dirty' | 'owner'>

/** The minimal server-owned facts a reconciliation decision needs. */
export interface Versioned {
  version?: number
  deletedAt?: string
}

/** Missing/NaN version means "never synced" → sorts below any real version. */
export function versionOf(r: Versioned | null | undefined): number {
  return r && Number.isFinite(r.version) ? (r.version as number) : 0
}

function isTombstone(r: Versioned | null | undefined): boolean {
  return !!(r && r.deletedAt)
}

// --- Server: accept/reject a pushed write --------------------------------

export interface PushResult {
  /** Whether the server stores the incoming write. */
  accepted: boolean
  /** Version the server would stamp on accept; the current stored version otherwise. */
  version: number
  /** Whether the resulting stored doc is a tombstone. */
  deleted: boolean
}

/**
 * Server-authoritative LWW decision for one pushed round (PHASE2.md §6.2, §11.2).
 * `incoming.version` is the client's *base* version; `stored` is the current
 * server doc (or null if the server has never seen this id).
 *
 * Rules:
 *  - New id → accept as version 1.
 *  - Delete (tombstone) → **delete wins**: accept over a same-or-older
 *    non-tombstone; re-deleting an existing tombstone is an idempotent no-op
 *    (no version bump, so lost-ack retries converge — §11.4/§11.9).
 *  - Normal edit → accept only if base === stored version (optimistic
 *    concurrency); an edit can never resurrect a tombstone; a stale base is
 *    rejected so the client pulls and re-applies.
 */
export function decidePush(incoming: Versioned, stored: Versioned | null): PushResult {
  const incomingDeleted = isTombstone(incoming)
  if (!stored) {
    // First time the server sees this id (an edit, or a tombstone for a round
    // the server never had — recorded so it still propagates/GCs).
    return { accepted: true, version: 1, deleted: incomingDeleted }
  }

  const storedV = versionOf(stored)
  const storedDeleted = isTombstone(stored)
  const base = versionOf(incoming)

  if (incomingDeleted) {
    if (storedDeleted) {
      // Idempotent re-delete (e.g. a lost-ack retry): keep the version steady.
      return { accepted: true, version: storedV, deleted: true }
    }
    // Delete wins over a same-or-older edit; never resurrected later (§11.2).
    if (base <= storedV) return { accepted: true, version: storedV + 1, deleted: true }
    // Client claims a base ahead of the server — an anomaly; reject.
    return { accepted: false, version: storedV, deleted: false }
  }

  // Incoming is a normal edit.
  if (storedDeleted) {
    // An edit must never un-delete a tombstone (§11.2). Client will pull it.
    return { accepted: false, version: storedV, deleted: true }
  }
  if (base === storedV) return { accepted: true, version: storedV + 1, deleted: false }
  // Stale base — a newer version exists server-side; reject → client pulls.
  return { accepted: false, version: storedV, deleted: false }
}

// --- Client: apply a pulled record to the local store --------------------

export interface ApplyResult {
  /** The round the local store should hold. */
  round: Round
  /** Whether this differs from the local record (i.e. a write is needed). */
  changed: boolean
}

/**
 * Reconcile a pulled remote round against the local copy (PHASE2.md §6.1, §11.2).
 * Higher server version wins — even over a dirty local edit, which is the LWW
 * loser and gets discarded (the client pushes before it pulls, so its edit was
 * already offered to the server). At equal version a tombstone wins over a live
 * local edit; otherwise the local record is kept, preserving any pending edit.
 *
 * A remote-won record is stamped `owner = accountId` (so the logout rule §11.5
 * can later clear it) and `dirty = 0` (it now matches the server).
 */
export function applyPull(local: Round | null, remote: SyncRound, accountId: string): ApplyResult {
  const applied = (): Round => ({ ...(remote as Round), owner: accountId, dirty: 0 })
  if (!local) return { round: applied(), changed: true }

  const lv = versionOf(local)
  const rv = versionOf(remote)
  if (rv > lv) return { round: applied(), changed: true }
  if (rv < lv) return { round: local, changed: false }

  // Equal version: delete wins over a live local edit (§11.2), else keep local
  // (identical content, or a pending dirty edit awaiting its next push).
  if (isTombstone(remote) && !isTombstone(local)) return { round: applied(), changed: true }
  return { round: local, changed: false }
}

// --- Client: apply a push ack --------------------------------------------

/** The server's per-record response to a push (PHASE2.md §6.2). */
export interface PushAck {
  id: string
  accepted: boolean
  version: number
  serverUpdatedAt?: string
}

/**
 * Fold a push ack back into the local round (PHASE2.md §11.4, §6.4).
 *
 * On **accept**, the round is adopted into the account (`owner = accountId`,
 * §6.4) and the server `version`/`serverUpdatedAt` are recorded. `dirty` is
 * cleared **only if** the local round is unchanged since it was pushed
 * (compare-and-clear): a mid-flight edit — a new `updatedAt`, or a delete
 * flipping `deletedAt` — keeps `dirty` so the edit is pushed next round, while
 * still recording the new base version so that next push isn't stale.
 *
 * On **reject** (stale base / delete-blocked), returns null: leave the round
 * dirty for the subsequent pull to reconcile.
 *
 * @param pushedSnapshot the round as it was at push time
 * @param current        the round as it is now (may have changed mid-flight)
 * @param ack            the server response
 * @param accountId      the syncing user id (adopts the round on accept)
 */
export function reconcilePushAck(
  pushedSnapshot: Pick<Round, 'updatedAt' | 'deletedAt'>,
  current: Round | null,
  ack: PushAck,
  accountId: string,
): Round | null {
  if (!ack.accepted || !current) return null
  const unchanged =
    current.updatedAt === pushedSnapshot.updatedAt && current.deletedAt === pushedSnapshot.deletedAt
  const next: Round = {
    ...current,
    owner: accountId,
    version: ack.version,
    serverUpdatedAt: ack.serverUpdatedAt,
  }
  if (unchanged) next.dirty = 0
  return next
}

// --- Selection & payload helpers -----------------------------------------

/**
 * The rounds a client should push: completed and dirty (PHASE2.md §11.11 —
 * drafts never sync). Tombstones of completed rounds are included (they carry
 * `status: 'complete'`). The caller pages these at {@link SYNC_PAGE_LIMIT}.
 */
export function pushableRounds(rounds: Round[]): Round[] {
  return rounds.filter((r) => r.dirty === 1 && r.status === 'complete')
}

/** Strip local-only bookkeeping before sending a round to the server (§5.2). */
export function toSyncPayload(round: Round): SyncRound {
  // Copy and drop local-only fields; `version` is kept as the CAS base, which
  // the server reads then re-stamps (§11.7).
  const copy: Partial<Round> = { ...round }
  delete copy.dirty
  delete copy.owner
  return copy as SyncRound
}

// --- Cursor / tombstone lifetime (server) --------------------------------

/**
 * Whether a pull cursor is too old to trust a delta and must full-resync
 * (PHASE2.md §11.3). A cursor older than the tombstone TTL may have missed a
 * delete that has since been GC'd, so the client would re-push the round as
 * alive; a full resync closes that.
 *
 * @param sinceMs the cursor time, in ms since epoch
 * @param nowMs   current time, in ms since epoch
 */
export function isCursorStale(sinceMs: number, nowMs: number, ttlDays = TOMBSTONE_TTL_DAYS): boolean {
  if (!Number.isFinite(sinceMs) || sinceMs <= 0) return false
  return nowMs - sinceMs > ttlDays * MS_PER_DAY
}

/**
 * The per-item Cosmos `ttl` (seconds) a tombstone should carry so it GCs
 * `ttlDays` after `deletedAt` (PHASE2.md §5.1, §11.3). Never returns below 1s
 * (0/negative would mean "no expiry" in Cosmos, which we must not do here).
 */
export function tombstoneTtlSeconds(
  deletedAt: string,
  nowMs: number,
  ttlDays = TOMBSTONE_TTL_DAYS,
): number {
  const deletedMs = Date.parse(deletedAt)
  const expiryMs = (Number.isFinite(deletedMs) ? deletedMs : nowMs) + ttlDays * MS_PER_DAY
  return Math.max(1, Math.ceil((expiryMs - nowMs) / 1000))
}
