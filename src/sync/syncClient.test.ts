// fake-indexeddb must be installed before the Dexie singleton is imported.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/db'
import type { Round } from '@/db/types'
import { decidePush, isCursorStale, versionOf } from '@/domain/sync'
import { sync, prepareMerge, clearAccountRounds, reapTombstones } from './syncClient'
import { setSyncUser } from './syncState'

/**
 * Integration tests for the sync engine glue (Dexie + fetch), which the pure
 * module and API parity tests don't exercise. A fake IndexedDB backs the store
 * and an in-memory server mirrors the real endpoints (reusing the same pure
 * decisions), so a full push→pull round-trip can be driven and asserted.
 */

const USER = 'auth0|matt'
const getToken = async () => 'test-token'
// A fixed "now". Seeded serverTs must be realistic epoch ms near this — a tiny
// value (e.g. 1000) looks >90 days old to the cursor and spuriously resyncs.
const NOW_MS = Date.parse('2026-07-28T00:00:00.000Z')

// --- in-memory server (mirrors api/src/functions/sync.js) ----------------

interface StoredDoc extends Record<string, unknown> {
  id: string
  version: number
  serverUpdatedAt?: string
  deletedAt?: string
  /** Server-owned pagination key (epoch ms) — mirrors the real `serverTs`. */
  serverTs: number
}

class FakeServer {
  docs = new Map<string, StoredDoc>()
  // Recent epoch ms so cursors are never spuriously "stale" (§11.3).
  clock = NOW_MS - 1_000_000
  nowMs = NOW_MS

  /** Seed a doc as if written by another device. */
  seed(doc: Partial<StoredDoc> & { id: string }): void {
    this.clock += 1
    this.docs.set(doc.id, { version: 1, serverTs: this.clock, ...doc } as StoredDoc)
  }

  push(body: { rounds: Array<Record<string, unknown>> }) {
    const results = []
    for (const raw of body.rounds) {
      const id = raw.id as string
      const base = Number.isFinite(raw.version) ? (raw.version as number) : 0
      const stored = this.docs.get(id) ?? null
      const decision = decidePush({ version: base, deletedAt: raw.deletedAt as string }, stored)
      if (!decision.accepted) {
        results.push({ id, accepted: false, version: decision.version, serverUpdatedAt: stored?.serverUpdatedAt })
        continue
      }
      if (stored && decision.version === versionOf(stored)) {
        results.push({ id, accepted: true, version: stored.version, serverUpdatedAt: stored.serverUpdatedAt })
        continue
      }
      this.clock += 1
      const serverUpdatedAt = new Date(this.clock).toISOString()
      const doc = { ...raw, id, version: decision.version, serverUpdatedAt, serverTs: this.clock } as StoredDoc
      this.docs.set(id, doc)
      results.push({ id, accepted: true, version: decision.version, serverUpdatedAt })
    }
    return { results }
  }

  pull(since: number, sinceId: string, limit: number) {
    if (isCursorStale(since, this.nowMs)) {
      return { resync: true, rounds: [], maxTs: 0, maxId: '', hasMore: false }
    }
    // Keyset over the same total `(serverTs, id)` order the real Cosmos query
    // uses, with ordinal id comparison — the SAME comparison the `id > sinceId`
    // keyset filter uses — mirroring Cosmos, where ORDER BY and the range
    // predicate share one collation. (Sorting with localeCompare but filtering
    // with `>` would desync the two and break keyset paging.)
    const idCmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
    const all = [...this.docs.values()]
      .filter((d) => d.serverTs > since || (d.serverTs === since && d.id > sinceId))
      .sort((a, b) => a.serverTs - b.serverTs || idCmp(a.id, b.id))
    const page = all.slice(0, limit)
    const rounds = page.map((d) => {
      // Strip the server-internal serverTs, like the real toClientRound.
      const copy: Record<string, unknown> = { ...d }
      delete copy.serverTs
      return copy
    })
    const last = page[page.length - 1]
    return {
      rounds,
      maxTs: last ? last.serverTs : since,
      maxId: last ? last.id : sinceId,
      hasMore: page.length === limit,
    }
  }
}

let server: FakeServer

function installFetch(srv: FakeServer) {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    let payload: unknown
    if (url.pathname === '/api/sync/push') {
      payload = srv.push(JSON.parse(String(init?.body)))
    } else if (url.pathname === '/api/sync/pull') {
      payload = srv.pull(
        Number(url.searchParams.get('since') ?? 0),
        url.searchParams.get('sinceId') ?? '',
        Number(url.searchParams.get('limit') ?? 100),
      )
    } else {
      throw new Error(`unexpected fetch: ${url.pathname}`)
    }
    return { ok: true, status: 200, json: async () => payload } as unknown as Response
  }) as unknown as typeof fetch
}

function round(overrides: Partial<Round> = {}): Round {
  return {
    id: 'r1',
    courseId: 1,
    courseName: 'Pine Ridge',
    clubName: 'Pine Ridge GC',
    gender: 'male',
    teeName: 'Blue',
    roundLength: '18',
    status: 'complete',
    date: '2026-07-01T12:00:00.000Z',
    holes: [{ holeNumber: 1, par: 4, handicap: 5, yardage: 400, score: 5 }],
    updatedAt: '2026-07-01T14:00:00.000Z',
    dirty: 1,
    owner: 'local',
    ...overrides,
  }
}

beforeEach(async () => {
  await db.rounds.clear()
  await db.syncState.clear()
  server = new FakeServer()
  installFetch(server)
})

describe('push', () => {
  it('adopts local rounds into the account and clears dirty on ack', async () => {
    await db.rounds.add(round({ id: 'r1' }))
    await sync(getToken, USER)

    const local = await db.rounds.get('r1')
    expect(local?.owner).toBe(USER)
    expect(local?.dirty).toBe(0)
    expect(local?.version).toBe(1)
    expect(server.docs.get('r1')?.version).toBe(1)
  })

  it('does not push drafts (§11.11)', async () => {
    await db.rounds.add(round({ id: 'd1', status: 'draft' }))
    await sync(getToken, USER)
    expect(server.docs.has('d1')).toBe(false)
    // draft stays dirty locally, untouched by sync
    expect((await db.rounds.get('d1'))?.dirty).toBe(1)
  })

  it('propagates a delete as a server tombstone', async () => {
    // A previously-synced round, now soft-deleted locally.
    server.seed({ id: 'r1', version: 1 })
    await db.rounds.add(
      round({ id: 'r1', owner: USER, version: 1, dirty: 1, deletedAt: '2026-07-10T00:00:00.000Z' }),
    )
    await sync(getToken, USER)
    const stored = server.docs.get('r1')
    expect(stored?.deletedAt).toBe('2026-07-10T00:00:00.000Z')
    expect(stored?.version).toBe(2)
    expect((await db.rounds.get('r1'))?.dirty).toBe(0)
  })
})

describe('pull', () => {
  it('applies a round created on another device, adopting ownership', async () => {
    server.seed({ ...round({ id: 'remote-1', notes: 'from device B' }), version: 3 })
    await sync(getToken, USER)
    const local = await db.rounds.get('remote-1')
    expect(local?.notes).toBe('from device B')
    expect(local?.owner).toBe(USER)
    expect(local?.dirty).toBe(0)
  })

  it('drains every record via keyset paging when a full page shares one serverTs', async () => {
    // 150 rounds all stamped the same serverTs — the case that stalls a
    // maxTs-only cursor and that OFFSET paging can skip. Keyset paging over the
    // total (serverTs, id) order must drain all of them exactly once (§11.9 fix).
    // A realistic recent epoch-ms value; a tiny one would look >90 days stale to
    // the cursor and spuriously resync.
    const ts = server.nowMs
    for (let i = 0; i < 150; i += 1) {
      server.docs.set(`s${i}`, { ...round({ id: `s${i}` }), version: 1, serverTs: ts } as StoredDoc)
    }
    await sync(getToken, USER)
    const count = await db.rounds.filter((r) => r.id.startsWith('s')).count()
    expect(count).toBe(150)
    // Two pull pages (100 + 50) via keyset advance, no infinite loop.
    const pulls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => String(c[0]).includes('/api/sync/pull'),
    )
    expect(pulls.length).toBe(2)
    expect((await db.syncState.get('sync'))?.lastPulledTs).toBe(ts)
  })

  it('re-applying an unchanged pull is idempotent', async () => {
    server.seed({ ...round({ id: 'r1' }), version: 2 })
    await sync(getToken, USER)
    const first = await db.rounds.get('r1')
    await sync(getToken, USER) // pull again from the advanced cursor
    const second = await db.rounds.get('r1')
    expect(second).toEqual(first)
  })
})

describe('stale-cursor resync (§11.3)', () => {
  it('drops account rounds the server no longer has and re-pulls fresh', async () => {
    // Cursor 91 days old (epoch ms) → server signals full resync.
    const stale = server.nowMs - 91 * 86_400_000
    await setSyncUser(USER)
    await db.syncState.put({ id: 'sync', userId: USER, lastPulledTs: stale })
    // A local account round the server no longer has (should be cleared).
    await db.rounds.add(round({ id: 'gone', owner: USER, version: 1, dirty: 0 }))
    // A local-only round that must be preserved across the resync.
    await db.rounds.add(round({ id: 'mine', owner: 'local', dirty: 1 }))
    // What the account actually has now.
    server.seed({ ...round({ id: 'fresh' }), version: 1 })

    await sync(getToken, USER)

    expect(await db.rounds.get('gone')).toBeUndefined()
    expect(await db.rounds.get('fresh')).toBeDefined()
    expect(await db.rounds.get('mine')).toBeDefined()
  })
})

describe('logout data rule (§11.5)', () => {
  it('clears account-owned rounds but keeps local-only ones', async () => {
    await db.rounds.bulkAdd([
      round({ id: 'acct', owner: USER, version: 1, dirty: 0 }),
      round({ id: 'local', owner: 'local', dirty: 1 }),
    ])
    await db.syncState.put({ id: 'sync', userId: USER, lastPulledTs: 42 })

    await clearAccountRounds()

    expect(await db.rounds.get('acct')).toBeUndefined()
    expect(await db.rounds.get('local')).toBeDefined()
    const state = await db.syncState.get('sync')
    expect(state?.userId).toBeNull()
    expect(state?.lastPulledTs).toBe(0)
  })
})

describe('reapTombstones (§11.3)', () => {
  it('drops synced tombstones past the TTL, keeping recent and dirty ones', async () => {
    const now = Date.parse('2026-07-28T00:00:00.000Z')
    const old = new Date(now - 91 * 86_400_000).toISOString()
    const recent = new Date(now - 10 * 86_400_000).toISOString()
    await db.rounds.bulkAdd([
      round({ id: 'old-synced', owner: USER, version: 1, dirty: 0, deletedAt: old }),
      round({ id: 'old-dirty', owner: USER, version: 1, dirty: 1, deletedAt: old }),
      round({ id: 'recent-synced', owner: USER, version: 1, dirty: 0, deletedAt: recent }),
      round({ id: 'alive', owner: USER, version: 1, dirty: 0 }),
    ])
    await reapTombstones(now)
    expect(await db.rounds.get('old-synced')).toBeUndefined() // reaped
    expect(await db.rounds.get('old-dirty')).toBeDefined() // unpushed delete kept
    expect(await db.rounds.get('recent-synced')).toBeDefined() // within TTL kept
    expect(await db.rounds.get('alive')).toBeDefined() // not a tombstone
  })
})

describe('prepareMerge (§6.4)', () => {
  it('marks local completed rounds dirty for adoption, leaving drafts', async () => {
    await db.rounds.bulkAdd([
      round({ id: 'c', status: 'complete', owner: 'local', dirty: 0 }),
      round({ id: 'd', status: 'draft', owner: 'local', dirty: 0 }),
    ])
    await prepareMerge()
    expect((await db.rounds.get('c'))?.dirty).toBe(1)
    expect((await db.rounds.get('d'))?.dirty).toBe(0)
  })
})
