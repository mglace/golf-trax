/**
 * Dexie (IndexedDB) database — the sole data store for the MVP.
 *
 * Tables:
 *  - courses: cached GolfCourseAPI course objects, keyed by API id.
 *  - rounds:  all rounds including in-progress drafts, keyed by uuid.
 *  - profile: single local profile row.
 */
import Dexie, { type EntityTable } from 'dexie'
import type { CachedCourse, Round, Profile } from './types'

export class GolfTraxDB extends Dexie {
  courses!: EntityTable<CachedCourse, 'id'>
  rounds!: EntityTable<Round, 'id'>
  profile!: EntityTable<Profile, 'id'>

  constructor() {
    super('golftrax')
    this.version(1).stores({
      // Only indexed fields are listed; non-indexed fields still persist.
      courses: 'id, lastPlayedDate',
      rounds: 'id, status, date, courseId',
      profile: 'id',
    })
  }
}

export const db = new GolfTraxDB()
