import { describe, it, expect } from 'vitest'
import {
  applyPull,
  decidePush,
  isCursorStale,
  pushableRounds,
  reconcilePushAck,
  toSyncPayload,
  tombstoneTtlSeconds,
  versionOf,
  TOMBSTONE_TTL_DAYS,
  type SyncRound,
} from './sync'
import type { Round } from '@/db/types'

// A minimal completed round. Overrides layer on the sync-relevant fields.
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

const ACCOUNT = 'auth0|matt'

describe('versionOf', () => {
  it('treats missing/NaN version as 0', () => {
    expect(versionOf(undefined)).toBe(0)
    expect(versionOf({})).toBe(0)
    expect(versionOf({ version: 3 })).toBe(3)
  })
})

describe('decidePush — server-authoritative LWW (§6.2, §11.2)', () => {
  it('accepts a brand-new round as version 1', () => {
    expect(decidePush({ version: 0 }, null)).toEqual({ accepted: true, version: 1, deleted: false })
  })

  it('accepts an edit whose base matches the stored version, bumping it', () => {
    expect(decidePush({ version: 5 }, { version: 5 })).toEqual({
      accepted: true,
      version: 6,
      deleted: false,
    })
  })

  it('rejects an edit with a stale base (a newer version exists)', () => {
    // §11.12 "offline edits on two devices → higher server version wins":
    // device B pushed first (server now at 6); device A pushes base 5 → reject.
    expect(decidePush({ version: 5 }, { version: 6 })).toEqual({
      accepted: false,
      version: 6,
      deleted: false,
    })
  })

  it('delete wins over a concurrent edit at the same base (§11.2)', () => {
    expect(decidePush({ version: 5, deletedAt: 't' }, { version: 5 })).toEqual({
      accepted: true,
      version: 6,
      deleted: true,
    })
  })

  it('delete wins even over a newer edit at an older base (never resurrected)', () => {
    expect(decidePush({ version: 4, deletedAt: 't' }, { version: 6 })).toEqual({
      accepted: true,
      version: 7,
      deleted: true,
    })
  })

  it('an edit can never resurrect a tombstone', () => {
    expect(decidePush({ version: 5 }, { version: 6, deletedAt: 't' })).toEqual({
      accepted: false,
      version: 6,
      deleted: true,
    })
  })

  it('re-deleting an existing tombstone is idempotent (no version bump)', () => {
    // §11.12 lost-ack retry: the client re-sends a delete it already applied.
    expect(decidePush({ version: 6, deletedAt: 't' }, { version: 6, deletedAt: 't' })).toEqual({
      accepted: true,
      version: 6,
      deleted: true,
    })
  })
})

describe('applyPull — client apply (§6.1, §11.2)', () => {
  it('takes a remote round the client has never seen, adopting ownership', () => {
    const remote = toSyncPayload(round({ version: 2, owner: 'local', dirty: 1 }))
    const { round: applied, changed } = applyPull(null, remote, ACCOUNT)
    expect(changed).toBe(true)
    expect(applied.owner).toBe(ACCOUNT)
    expect(applied.dirty).toBe(0)
    expect(applied.version).toBe(2)
  })

  it('higher server version wins over a dirty local edit (§11.12)', () => {
    const local = round({ version: 5, dirty: 1, notes: 'my local edit' })
    const remote = toSyncPayload(round({ version: 6, notes: 'other device' }))
    const { round: applied, changed } = applyPull(local, remote, ACCOUNT)
    expect(changed).toBe(true)
    expect(applied.notes).toBe('other device')
    expect(applied.version).toBe(6)
    expect(applied.dirty).toBe(0)
  })

  it('a pulled delete propagates to the second device (§11.12)', () => {
    const local = round({ version: 5 })
    const remote = toSyncPayload(round({ version: 6, deletedAt: '2026-07-10T00:00:00.000Z' }))
    const { round: applied, changed } = applyPull(local, remote, ACCOUNT)
    expect(changed).toBe(true)
    expect(applied.deletedAt).toBe('2026-07-10T00:00:00.000Z')
  })

  it('delete-vs-edit at equal version → delete wins (§11.2)', () => {
    const local = round({ version: 6, dirty: 1, notes: 'edited here' })
    const remote = toSyncPayload(round({ version: 6, deletedAt: '2026-07-10T00:00:00.000Z' }))
    const { round: applied, changed } = applyPull(local, remote, ACCOUNT)
    expect(changed).toBe(true)
    expect(applied.deletedAt).toBe('2026-07-10T00:00:00.000Z')
  })

  it('keeps a pending dirty local edit when versions are equal and neither deleted', () => {
    const local = round({ version: 6, dirty: 1, notes: 'pending' })
    const remote = toSyncPayload(round({ version: 6, notes: 'pending' }))
    const { round: applied, changed } = applyPull(local, remote, ACCOUNT)
    expect(changed).toBe(false)
    expect(applied.dirty).toBe(1)
  })

  it('re-seeing an already-applied record is a no-op (idempotent pull, §11.9)', () => {
    const local = round({ version: 6, owner: ACCOUNT, dirty: 0 })
    const remote = toSyncPayload(round({ version: 6, owner: ACCOUNT }))
    expect(applyPull(local, remote, ACCOUNT).changed).toBe(false)
  })
})

describe('reconcilePushAck — compare-and-clear (§11.4, §6.4)', () => {
  it('clears dirty and adopts the account when unchanged since push', () => {
    const snap = round({ version: 5 })
    const current = round({ version: 5, dirty: 1 })
    const next = reconcilePushAck(snap, current, {
      id: 'r1',
      accepted: true,
      version: 6,
      serverUpdatedAt: '2026-07-01T15:00:00.000Z',
    }, ACCOUNT)
    expect(next).not.toBeNull()
    expect(next!.dirty).toBe(0)
    expect(next!.owner).toBe(ACCOUNT)
    expect(next!.version).toBe(6)
    expect(next!.serverUpdatedAt).toBe('2026-07-01T15:00:00.000Z')
  })

  it('preserves a mid-flight edit: records the version but keeps dirty', () => {
    const snap = { updatedAt: '2026-07-01T14:00:00.000Z', deletedAt: undefined }
    // A newer edit landed while the push was in flight (newer updatedAt).
    const current = round({ version: 5, dirty: 1, updatedAt: '2026-07-01T14:05:00.000Z' })
    const next = reconcilePushAck(snap, current, { id: 'r1', accepted: true, version: 6 }, ACCOUNT)
    expect(next!.dirty).toBe(1) // still dirty → pushed again next round
    expect(next!.version).toBe(6) // but the base advanced so that push isn't stale
  })

  it('treats a delete landing mid-flight as a change (keeps dirty)', () => {
    const snap = { updatedAt: '2026-07-01T14:00:00.000Z', deletedAt: undefined }
    const current = round({ version: 5, dirty: 1, deletedAt: '2026-07-01T14:06:00.000Z' })
    const next = reconcilePushAck(snap, current, { id: 'r1', accepted: true, version: 6 }, ACCOUNT)
    expect(next!.dirty).toBe(1)
  })

  it('returns null on a rejected push (leave dirty for the pull to reconcile)', () => {
    const snap = round({ version: 5 })
    const current = round({ version: 5, dirty: 1 })
    expect(
      reconcilePushAck(snap, current, { id: 'r1', accepted: false, version: 6 }, ACCOUNT),
    ).toBeNull()
  })
})

describe('first-login merge with overlapping UUIDs is collision-free (§6.4, §11.12)', () => {
  it('same-id local and account rounds reconcile by version rather than duplicating', () => {
    // Device has a local round r1 (never synced); the account already has r1
    // from another device at version 3. Push is rejected (stale base 0 vs 3),
    // then the pull reconciles: the account version wins, no duplicate id.
    const localR1 = round({ id: 'r1', owner: 'local', version: undefined, dirty: 1 })
    expect(decidePush(toSyncPayload(localR1), { version: 3 }).accepted).toBe(false)
    const remoteR1: SyncRound = toSyncPayload(round({ id: 'r1', version: 3, notes: 'account copy' }))
    const merged = applyPull(localR1, remoteR1, ACCOUNT)
    expect(merged.round.id).toBe('r1')
    expect(merged.round.notes).toBe('account copy')
    expect(merged.round.owner).toBe(ACCOUNT)
  })

  it('a local round the account lacks is accepted as a new document', () => {
    const localNew = round({ id: 'r2', owner: 'local', version: undefined, dirty: 1 })
    expect(decidePush(toSyncPayload(localNew), null)).toEqual({
      accepted: true,
      version: 1,
      deleted: false,
    })
  })
})

describe('pushableRounds — drafts never sync (§11.11)', () => {
  it('selects only completed dirty rounds (incl. their tombstones)', () => {
    const rounds = [
      round({ id: 'a', status: 'complete', dirty: 1 }),
      round({ id: 'b', status: 'draft', dirty: 1 }), // draft → excluded
      round({ id: 'c', status: 'complete', dirty: 0 }), // clean → excluded
      round({ id: 'd', status: 'complete', dirty: 1, deletedAt: 't' }), // tombstone → included
    ]
    expect(pushableRounds(rounds).map((r) => r.id)).toEqual(['a', 'd'])
  })
})

describe('toSyncPayload', () => {
  it('drops local-only fields but keeps version as the CAS base', () => {
    const payload = toSyncPayload(round({ version: 4, dirty: 1, owner: ACCOUNT }))
    expect('dirty' in payload).toBe(false)
    expect('owner' in payload).toBe(false)
    expect(payload.version).toBe(4)
  })
})

describe('cursor staleness → full resync (§11.3, §11.12)', () => {
  const now = Date.parse('2026-07-28T00:00:00.000Z')

  it('is not stale within the tombstone TTL', () => {
    const recent = now - (TOMBSTONE_TTL_DAYS - 1) * 86_400_000
    expect(isCursorStale(recent, now)).toBe(false)
  })

  it('is stale once older than the tombstone TTL', () => {
    const old = now - (TOMBSTONE_TTL_DAYS + 1) * 86_400_000
    expect(isCursorStale(old, now)).toBe(true)
  })

  it('treats a zero/absent cursor as fresh (first sync, not a resync)', () => {
    expect(isCursorStale(0, now)).toBe(false)
  })
})

describe('tombstoneTtlSeconds', () => {
  const now = Date.parse('2026-07-28T00:00:00.000Z')

  it('is ~90 days for a just-created tombstone', () => {
    const secs = tombstoneTtlSeconds('2026-07-28T00:00:00.000Z', now)
    expect(secs).toBe(TOMBSTONE_TTL_DAYS * 86_400)
  })

  it('shrinks for an older tombstone and never drops below 1', () => {
    const old = tombstoneTtlSeconds('2026-01-01T00:00:00.000Z', now) // >90d ago
    expect(old).toBe(1)
  })
})
