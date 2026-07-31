/**
 * Dexie (IndexedDB) database — the sole data store for the MVP.
 *
 * Tables:
 *  - courses: cached GolfCourseAPI course objects, keyed by API id.
 *  - rounds:  all rounds including in-progress drafts, keyed by uuid.
 *  - profile: single local profile row.
 */
import Dexie, { type EntityTable } from 'dexie'
import type { CachedCourse, Round, Profile, SyncState } from './types'

export class GolfTraxDB extends Dexie {
  courses!: EntityTable<CachedCourse, 'id'>
  rounds!: EntityTable<Round, 'id'>
  profile!: EntityTable<Profile, 'id'>
  syncState!: EntityTable<SyncState, 'id'>

  constructor() {
    super('golftrax')
    // Only indexed fields are listed; non-indexed fields still persist.
    this.version(1).stores({
      courses: 'id, lastPlayedDate',
      rounds: 'id, status, date, courseId',
      profile: 'id',
    })
    // v2 (Phase 2 sync): index `dirty` (the push query is
    // `where('dirty').equals(1)`) and `deletedAt` (find/exclude tombstones);
    // add the singleton `syncState` table. The upgrade backfills existing
    // rounds so every persisted row carries the sync bookkeeping the engine
    // relies on: `dirty = 0` (already synced/at rest) and `owner = 'local'`
    // (pre-account; adopted by an account on first push — PHASE2.md §5.2, §11.5).
    // `deletedAt`/`version`/`serverUpdatedAt` stay unset (never-synced rows).
    this.version(2)
      .stores({
        courses: 'id, lastPlayedDate',
        rounds: 'id, status, date, courseId, dirty, deletedAt',
        profile: 'id',
        syncState: 'id',
      })
      .upgrade(async (tx) => {
        await tx
          .table('rounds')
          .toCollection()
          .modify((r: Round) => {
            if (r.dirty === undefined) r.dirty = 0
            if (r.owner === undefined) r.owner = 'local'
          })
      })
    // v3: course ids are opaque STRINGS. Older data stored manual courses under
    // a numeric primary key (`-1`, `-2`, …) and rounds referenced them by number.
    // IndexedDB keys are type-sensitive, so a string route param / lookup would
    // never match a numeric key — restamp every numeric id as its string form
    // (a course primary key can't be modified in place, so delete + re-put).
    this.version(3)
      .stores({
        courses: 'id, lastPlayedDate',
        rounds: 'id, status, date, courseId, dirty, deletedAt',
        profile: 'id',
        syncState: 'id',
      })
      .upgrade(async (tx) => {
        const courses = tx.table('courses')
        const numericId = await courses.filter((c) => typeof c.id === 'number').toArray()
        for (const c of numericId) {
          await courses.delete(c.id)
          await courses.put({ ...c, id: String(c.id) })
        }
        await tx
          .table('rounds')
          .toCollection()
          .modify((r: { courseId: unknown }) => {
            if (typeof r.courseId === 'number') r.courseId = String(r.courseId)
          })
      })
  }
}

export const db = new GolfTraxDB()
