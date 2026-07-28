import { describe, it, expect } from 'vitest'
import {
  BACKUP_APP,
  BACKUP_SCHEMA_VERSION,
  BackupError,
  backupFilename,
  buildBackup,
  parseBackup,
  type BackupData,
} from './backup'
import type { CachedCourse, Round } from '@/db/types'

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
    ...overrides,
  }
}

function course(overrides: Partial<CachedCourse> = {}): CachedCourse {
  return {
    // ApiCourse fields are spread through; only the ones the app relies on
    // are asserted here, so a minimal shape is fine for the round-trip test.
    id: 1,
    club_name: 'Pine Ridge GC',
    cachedAt: '2026-07-01T12:00:00.000Z',
    ...overrides,
  } as CachedCourse
}

const sampleData: BackupData = {
  courses: [course()],
  rounds: [round()],
  profile: { id: 'profile', name: 'Matt' },
}

describe('buildBackup', () => {
  it('wraps data in a versioned envelope', () => {
    const b = buildBackup(sampleData, '2026-07-28T00:00:00.000Z')
    expect(b.app).toBe(BACKUP_APP)
    expect(b.schemaVersion).toBe(BACKUP_SCHEMA_VERSION)
    expect(b.exportedAt).toBe('2026-07-28T00:00:00.000Z')
    expect(b.data.rounds).toHaveLength(1)
  })
})

describe('parseBackup round-trip', () => {
  it('parses what buildBackup produced, preserving records', () => {
    const text = JSON.stringify(buildBackup(sampleData, '2026-07-28T00:00:00.000Z'))
    const { backup, skipped } = parseBackup(text)
    expect(skipped).toEqual({ courses: 0, rounds: 0 })
    expect(backup.data.rounds[0].id).toBe('r1')
    expect(backup.data.courses[0].id).toBe(1)
    expect(backup.data.profile?.name).toBe('Matt')
  })
})

describe('parseBackup validation', () => {
  it('rejects non-JSON', () => {
    expect(() => parseBackup('not json {')).toThrow(BackupError)
  })

  it('rejects a JSON blob that is not a GolfTrax backup', () => {
    expect(() => parseBackup(JSON.stringify({ foo: 'bar' }))).toThrow(/not a GolfTrax backup/)
  })

  it('rejects a backup from a newer schema version', () => {
    const text = JSON.stringify({
      app: BACKUP_APP,
      schemaVersion: BACKUP_SCHEMA_VERSION + 1,
      exportedAt: '',
      data: { courses: [], rounds: [], profile: null },
    })
    expect(() => parseBackup(text)).toThrow(/newer version/)
  })

  it('throws when the data section is missing', () => {
    const text = JSON.stringify({ app: BACKUP_APP, schemaVersion: 1, exportedAt: '' })
    expect(() => parseBackup(text)).toThrow(/missing its data section/)
  })

  it('skips malformed rounds and courses but keeps valid ones', () => {
    const text = JSON.stringify({
      app: BACKUP_APP,
      schemaVersion: 1,
      exportedAt: '2026-07-28T00:00:00.000Z',
      data: {
        rounds: [
          round(),
          { id: 'bad', courseId: 'not-a-number' }, // invalid
          { nope: true }, // invalid
        ],
        courses: [course(), { club_name: 'no id' }],
        profile: null,
      },
    })
    const { backup, skipped } = parseBackup(text)
    expect(backup.data.rounds).toHaveLength(1)
    expect(backup.data.courses).toHaveLength(1)
    expect(skipped).toEqual({ courses: 1, rounds: 2 })
  })

  it('backfills updatedAt from date for older round exports', () => {
    const legacy = round()
    delete (legacy as Partial<Round>).updatedAt
    const text = JSON.stringify({
      app: BACKUP_APP,
      schemaVersion: 1,
      exportedAt: '',
      data: { rounds: [legacy], courses: [], profile: null },
    })
    const { backup } = parseBackup(text)
    expect(backup.data.rounds[0].updatedAt).toBe(legacy.date)
  })

  it('tolerates a missing profile', () => {
    const text = JSON.stringify({
      app: BACKUP_APP,
      schemaVersion: 1,
      exportedAt: '',
      data: { rounds: [], courses: [] },
    })
    const { backup } = parseBackup(text)
    expect(backup.data.profile).toBeNull()
  })
})

describe('backupFilename', () => {
  it('uses the date portion of the export timestamp', () => {
    expect(backupFilename('2026-07-28T09:30:00.000Z')).toBe('golftrax-backup-2026-07-28.json')
  })
  it('falls back when the timestamp is empty', () => {
    expect(backupFilename('')).toBe('golftrax-backup-export.json')
  })
})
