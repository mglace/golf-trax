import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  dismissCloudPromptForever,
  getCloudPromptPrefs,
  recordCloudPromptShown,
  setPendingSignIn,
} from './prefsRepo'
import { countCompletedRounds } from './roundsRepo'
import { db } from './db'
import type { Round } from './types'

function round(id: string, over: Partial<Round> = {}): Round {
  return {
    id,
    courseId: 'c1',
    courseName: 'Test Links',
    clubName: 'Test Links',
    gender: 'male',
    teeName: 'Blue',
    roundLength: '18',
    status: 'complete',
    date: '2026-08-01T12:00:00.000Z',
    holes: [],
    updatedAt: '2026-08-01T12:00:00.000Z',
    dirty: 0,
    owner: 'local',
    ...over,
  }
}

beforeEach(async () => {
  await db.prefs.clear()
  await db.rounds.clear()
})

describe('cloud prompt prefs', () => {
  it('reads as undefined before anything is written', async () => {
    expect(await getCloudPromptPrefs()).toBeUndefined()
  })

  it('creates the singleton row on first write', async () => {
    await recordCloudPromptShown(1)
    expect(await getCloudPromptPrefs()).toEqual({ id: 'cloudPrompt', lastPromptedCount: 1 })
  })

  it('merges later writes instead of replacing the row', async () => {
    await recordCloudPromptShown(1)
    await setPendingSignIn(true)
    await dismissCloudPromptForever()

    expect(await getCloudPromptPrefs()).toEqual({
      id: 'cloudPrompt',
      lastPromptedCount: 1,
      pendingSignIn: true,
      dismissedForever: true,
    })
  })

  it('advances the milestone on a repeat showing', async () => {
    await recordCloudPromptShown(1)
    await recordCloudPromptShown(3)
    expect((await getCloudPromptPrefs())?.lastPromptedCount).toBe(3)
  })

  it('round-trips the pending-sign-in flag both ways', async () => {
    await setPendingSignIn(true)
    expect((await getCloudPromptPrefs())?.pendingSignIn).toBe(true)
    await setPendingSignIn(false)
    expect((await getCloudPromptPrefs())?.pendingSignIn).toBe(false)
  })

  it('stays a single row no matter how many writes land', async () => {
    await recordCloudPromptShown(1)
    await setPendingSignIn(true)
    await recordCloudPromptShown(3)
    expect(await db.prefs.count()).toBe(1)
  })
})

describe('countCompletedRounds', () => {
  it('is zero on an empty library', async () => {
    expect(await countCompletedRounds()).toBe(0)
  })

  it('counts only completed rounds', async () => {
    await db.rounds.bulkPut([round('a'), round('b'), round('c', { status: 'draft' })])
    expect(await countCompletedRounds()).toBe(2)
  })

  it('excludes tombstones', async () => {
    await db.rounds.bulkPut([
      round('a'),
      round('b', { deletedAt: '2026-08-02T00:00:00.000Z' }),
    ])
    expect(await countCompletedRounds()).toBe(1)
  })
})
