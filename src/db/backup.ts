/**
 * Dexie (IndexedDB) read/write for local-data backups.
 *
 * Thin wrappers over the store that read every table into a backup envelope and
 * merge a parsed backup back in. All validation/serialization lives in
 * `@/domain/backup` (pure + unit-tested); this file only touches Dexie.
 */
import { db } from './db'
import {
  type Backup,
  type BackupData,
  buildBackup,
} from '@/domain/backup'

/** Read all tables and wrap them in a versioned, downloadable backup envelope. */
export async function exportBackup(): Promise<Backup> {
  const [courses, rounds, profile] = await Promise.all([
    db.courses.toArray(),
    db.rounds.toArray(),
    db.profile.get('profile'),
  ])
  const data: BackupData = { courses, rounds, profile: profile ?? null }
  return buildBackup(data, new Date().toISOString())
}

/** Number of records written per table during an import. */
export interface ImportResult {
  courses: number
  rounds: number
  profile: boolean
}

/**
 * Merge a validated backup into the local store. Existing records with the same
 * key are overwritten (bulkPut); records only present locally are left intact,
 * so importing a backup restores lost data without deleting anything the user
 * has added since. Runs in a single transaction so a mid-import failure rolls
 * back cleanly rather than leaving a half-restored store.
 */
export async function importBackup(data: BackupData): Promise<ImportResult> {
  return db.transaction('rw', db.courses, db.rounds, db.profile, async () => {
    if (data.courses.length) await db.courses.bulkPut(data.courses)
    if (data.rounds.length) await db.rounds.bulkPut(data.rounds)
    if (data.profile) await db.profile.put(data.profile)
    return {
      courses: data.courses.length,
      rounds: data.rounds.length,
      profile: Boolean(data.profile),
    }
  })
}
