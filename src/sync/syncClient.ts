/**
 * The client sync engine (PHASE2.md §6). Orchestrates a best-effort, idempotent
 * push-then-pull round-trip against `/api/sync/*`, applying the pure decisions
 * from `@/domain/sync` and persisting the pull cursor transactionally with the
 * pulled changes (§11.4). Only completed rounds sync; drafts stay device-local
 * (§11.11).
 *
 * All reconciliation math lives in the pure module; this file is the Dexie +
 * fetch glue. It never throws to its callers — failures resolve to a status.
 */
import { db } from '@/db/db'
import type { Round } from '@/db/types'
import {
  applyPull,
  pushableRounds,
  reconcilePushAck,
  toSyncPayload,
  SYNC_PAGE_LIMIT,
  type PushAck,
  type SyncRound,
} from '@/domain/sync'
import { getSyncState } from './syncState'
import { useSyncStore, type SyncStatus } from './syncStore'

export type GetToken = () => Promise<string | null>

interface PushResponse {
  results: (PushAck & { invalid?: boolean })[]
}
interface PullResponse {
  rounds?: SyncRound[]
  maxTs?: number
  hasMore?: boolean
  resync?: boolean
}

async function apiFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(`/api/${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
}

/**
 * Mark every local-only completed round dirty so the first push after sign-in
 * adopts it into the account (anonymous → account merge, §6.4). Idempotent.
 */
export async function prepareMerge(): Promise<void> {
  await db.rounds
    .filter((r) => r.owner === 'local' && r.status === 'complete')
    .modify({ dirty: 1 })
}

/** Push all completed dirty rounds, paging at the 100-record cap (§11.8). */
async function pushChanges(token: string, userId: string): Promise<void> {
  const dirty = await db.rounds.where('dirty').equals(1).toArray()
  const pushable = pushableRounds(dirty)
  for (let i = 0; i < pushable.length; i += SYNC_PAGE_LIMIT) {
    const page = pushable.slice(i, i + SYNC_PAGE_LIMIT)
    // Snapshot the compare-and-clear keys at send time (§11.4).
    const snapshots = new Map(
      page.map((r) => [r.id, { updatedAt: r.updatedAt, deletedAt: r.deletedAt }]),
    )
    const res = await apiFetch('sync/push', token, {
      method: 'POST',
      body: JSON.stringify({ rounds: page.map(toSyncPayload) }),
    })
    if (!res.ok) throw new Error(`push failed: ${res.status}`)
    const { results } = (await res.json()) as PushResponse

    await db.transaction('rw', db.rounds, async () => {
      for (const ack of results) {
        const current = (await db.rounds.get(ack.id)) ?? null
        if (!current) continue
        if (ack.invalid) {
          // Server rejected as structurally invalid — quarantine locally so we
          // stop re-pushing it every cycle, but keep it visible/exportable.
          await db.rounds.update(ack.id, { dirty: 0 })
          continue
        }
        const snap = snapshots.get(ack.id)
        if (!snap) continue
        const next = reconcilePushAck(snap, current, ack, userId)
        if (next) await db.rounds.put(next)
      }
    })
  }
}

/** Pull remote changes since the cursor and apply LWW, paging until drained. */
async function pullChanges(token: string, userId: string): Promise<void> {
  for (;;) {
    const state = await getSyncState()
    const since = state.userId === userId ? state.lastPulledTs : 0
    const res = await apiFetch(`sync/pull?since=${since}&limit=${SYNC_PAGE_LIMIT}`, token)
    if (!res.ok) throw new Error(`pull failed: ${res.status}`)
    const data = (await res.json()) as PullResponse

    if (data.resync) {
      // Cursor older than the tombstone TTL (§11.3): drop this account's synced
      // rounds and restart from 0. Local-only rounds are preserved.
      await db.transaction('rw', db.rounds, db.syncState, async () => {
        await db.rounds.filter((r) => r.owner === userId).delete()
        await db.syncState.put({ id: 'sync', userId, lastPulledTs: 0 })
      })
      continue
    }

    const remote = data.rounds ?? []
    const maxTs = data.maxTs ?? since
    // Apply changes AND advance the cursor in one transaction so a crash can
    // never leave the cursor ahead of the applied data (§11.4).
    await db.transaction('rw', db.rounds, db.syncState, async () => {
      for (const r of remote) {
        const local = (await db.rounds.get(r.id)) ?? null
        const { round, changed } = applyPull(local, r, userId)
        if (changed) await db.rounds.put(round as Round)
      }
      await db.syncState.put({ id: 'sync', userId, lastPulledTs: maxTs })
    })

    if (!data.hasMore) return
  }
}

/**
 * Logout data rule (PHASE2.md §11.5). Clear every account-owned round (owner is
 * a userId) and reset the cursor; keep `owner === 'local'` rounds. This is what
 * makes sign-out safe on a shared device — one account's synced rounds never
 * linger into another's session — and is safe because those rounds live on the
 * server and re-pull on next sign-in.
 */
export async function clearAccountRounds(): Promise<void> {
  await db.transaction('rw', db.rounds, db.syncState, async () => {
    await db.rounds.filter((r) => typeof r.owner === 'string' && r.owner !== 'local').delete()
    await db.syncState.put({ id: 'sync', userId: null, lastPulledTs: 0 })
  })
}

// Single-flight: coalesce concurrent triggers into one in-flight round-trip.
let inFlight: Promise<SyncStatus> | null = null

async function runSync(getToken: GetToken, userId: string): Promise<SyncStatus> {
  const store = useSyncStore.getState()
  const token = await getToken()
  if (!token) {
    // No valid token (offline/expired) — sync paused, app keeps working (§4).
    store.setStatus('paused')
    return 'paused'
  }
  store.setStatus('syncing')
  try {
    await pushChanges(token, userId)
    await pullChanges(token, userId)
    store.markSynced(Date.now())
    return 'synced'
  } catch {
    store.setStatus('error')
    return 'error'
  }
}

/**
 * Run a push-then-pull round-trip for `userId`. Best-effort and idempotent;
 * concurrent calls coalesce into the single in-flight run. Resolves to the
 * final status so callers can drive retry/backoff.
 */
export function sync(getToken: GetToken, userId: string): Promise<SyncStatus> {
  if (inFlight) return inFlight
  inFlight = runSync(getToken, userId).finally(() => {
    inFlight = null
  })
  return inFlight
}
