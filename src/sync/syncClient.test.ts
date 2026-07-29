// fake-indexeddb must be installed before the Dexie singleton is imported.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/db'
import type { Round } from '@/db/types'
import { decidePush, isCursorStale, versionOf } from '@/domain/sync'
import { sync, prepareMerge, clearAccountRounds } from './syncClient'
import { setSyncUser } from './syncState'

/**
 * Integration tests for the sync engine glue (Dexie + fetch), which the pure
 * module and API parity tests don't exercise. A fake IndexedDB backs the store
 * and an in-memory server mirrors the real endpoints (reusing the same pure
 * decisions), so a full push→pull round-trip can be driven and asserted.
 */

const USER = 'auth0|matt'
const getToken = async () => 'test-token'

// --- in-memory server (mirrors api/src/functions/sync.js) ----------------

interface StoredDoc extends Record<string, unknown> {
  id: string
  version: number
  serverUpdatedAt?: string
  deletedAt?: string
  _ts: number
}

class FakeServer {
  docs = new Map<string, StoredDoc>()
  clock = 1000
  nowMs = Date.parse('2026-07-28T00:00:00.000Z')

  /** Seed a doc as if written by another device. */
  seed(doc: Partial<StoredDoc> & { id: string }): void {
    this.clock += 1
    this.docs.set(doc.id, { version: 1, _ts: this.clock, ...doc } as StoredDoc)
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
      const serverUpdatedAt = new Date(this.clock * 1000).toISOString()
      const doc = { ...raw, id, version: decision.version, serverUpdatedAt, _ts: this.clock } as StoredDoc
      this.docs.set(id, doc)
      results.push({ id, accepted: true, version: decision.version, serverUpdatedAt })
    }
    return { results }
  }

  pull(since: number, offset: number, limit: number) {
    if (isCursorStale(since * 1000, this.nowMs)) {
      return { resync: true, rounds: [], maxTs: 0, hasMore: false }
    }
    const all = [...this.docs.values()]
      .filter((d) => d._ts >= since)
      .sort((a, b) => a._ts - b._ts || a.id.localeCompare(b.id))
    const page = all.slice(offset, offset + limit)
    const rounds = page.map((d) => {
      // Strip the server-internal _ts, like the real toClientRound.
      const copy: Record<string, unknown> = { ...d }
      delete copy._ts
      return copy
    })
    const maxTs = page.reduce((m, d) => (d._ts > m ? d._ts : m), since)
    return { rounds, maxTs, hasMore: page.length === limit }
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
        Number(url.searchParams.get('offset') ?? 0),
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

  it('terminates and applies every record when a full page shares one _ts', async () => {
    // 150 rounds all stamped the same second — the case that would loop a
    // maxTs-only cursor. Offset paging must drain all of them (§11.9 fix).
    for (let i = 0; i < 150; i += 1) {
      server.docs.set(`s${i}`, { ...round({ id: `s${i}` }), version: 1, _ts: 5000 } as StoredDoc)
    }
    await sync(getToken, USER)
    const count = await db.rounds.filter((r) => r.id.startsWith('s')).count()
    expect(count).toBe(150)
    // Two pull pages (100 + 50) → offset advanced, no infinite loop.
    const pulls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => String(c[0]).includes('/api/sync/pull'),
    )
    expect(pulls.length).toBe(2)
    expect((await db.syncState.get('sync'))?.lastPulledTs).toBe(5000)
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
    // Cursor 91 days old → server signals full resync.
    const stale = Math.floor(server.nowMs / 1000) - 91 * 86_400
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
