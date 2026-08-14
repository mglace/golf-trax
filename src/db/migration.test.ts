import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import Dexie from 'dexie'

/**
 * Guards the `version(4)` upgrade in `db.ts` against a database that already
 * exists on a user's device at v3 — the case a fresh-install test can't reach.
 * Adding a version block wrongly (a changed store spec, a missing table in the
 * repeated map) surfaces here as a failed open or lost rows rather than as a
 * broken app on someone's phone.
 *
 * The v3 schema below is a frozen copy of what shipped; it must NOT be updated
 * to track later edits to `db.ts`, or the test stops reproducing the upgrade.
 */
const V3_ROUNDS = 'id, status, date, courseId, dirty, deletedAt'

async function seedV3Database() {
  const legacy = new Dexie('golftrax')
  legacy.version(1).stores({
    courses: 'id, lastPlayedDate',
    rounds: 'id, status, date, courseId',
    profile: 'id',
  })
  legacy.version(2).stores({
    courses: 'id, lastPlayedDate',
    rounds: V3_ROUNDS,
    profile: 'id',
    syncState: 'id',
  })
  legacy.version(3).stores({
    courses: 'id, lastPlayedDate',
    rounds: V3_ROUNDS,
    profile: 'id',
    syncState: 'id',
  })
  await legacy.open()
  await legacy.table('rounds').put({
    id: 'r1',
    courseId: 'c1',
    courseName: 'Old Course',
    clubName: 'Old Course',
    gender: 'male',
    teeName: 'Blue',
    roundLength: '18',
    status: 'complete',
    date: '2026-07-04T12:00:00.000Z',
    holes: [],
    updatedAt: '2026-07-04T12:00:00.000Z',
    dirty: 0,
    owner: 'local',
  })
  await legacy.table('profile').put({ id: 'profile', name: 'Matt' })
  await legacy.table('syncState').put({ id: 'sync', userId: null, lastPulledTs: 0 })
  legacy.close()
}

describe('Dexie v3 → v4 upgrade', () => {
  it('opens an existing v3 database, keeps its data, and adds the prefs table', async () => {
    await seedV3Database()

    // Imported only after the legacy database exists, so the singleton opens
    // against v3 data rather than creating an empty v4 store first.
    const { db } = await import('./db')
    await db.open()

    expect(db.verno).toBe(4)

    // Nothing that was there before may be lost by the upgrade.
    expect(await db.rounds.count()).toBe(1)
    const round = await db.rounds.get('r1')
    expect(round?.courseName).toBe('Old Course')
    expect(round?.owner).toBe('local')
    expect((await db.profile.get('profile'))?.name).toBe('Matt')
    expect(await db.syncState.get('sync')).toBeTruthy()

    // And the new table is usable, empty — i.e. "never prompted" for a user
    // upgrading in place, so they get the offer like anyone else.
    expect(await db.prefs.count()).toBe(0)
    await db.prefs.put({ id: 'cloudPrompt', lastPromptedCount: 1 })
    expect(await db.prefs.get('cloudPrompt')).toEqual({
      id: 'cloudPrompt',
      lastPromptedCount: 1,
    })
  })
})
