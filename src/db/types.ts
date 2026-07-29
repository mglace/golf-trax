/**
 * Local persistence types (stored in IndexedDB via Dexie).
 *
 * These are the ONLY source of truth for the MVP — there is no backend, no
 * accounts, and no sync. Round data snapshots the hole details it needs at
 * finalize time so a round remains intact even if the cached course changes.
 */
import type { ApiCourse } from '@/api/types'

export type Gender = 'male' | 'female'
export type RoundLength = 'front9' | 'back9' | '18'
export type RoundStatus = 'draft' | 'complete'

/**
 * A course cached from a GolfCourseAPI response. We keep the raw API shape
 * (spread) plus a little local bookkeeping for the "recently played" carousel.
 */
export interface CachedCourse extends ApiCourse {
  /** ISO timestamp of the last round played here; drives the recents carousel. */
  lastPlayedDate?: string
  /** ISO timestamp of when this course was cached/refreshed. */
  cachedAt: string
  /**
   * True for a course the user entered by hand (Phase 2d) rather than one from
   * GolfCourseAPI. Manual courses carry a negative `id` so they never collide
   * with API ids, and are badged in the UI. Local-only bookkeeping.
   */
  isManual?: boolean
}

/**
 * A single hole within a round. Par/handicap/yardage are snapshotted from the
 * selected tee box at round-creation time. `holeNumber` is the absolute number
 * on the course (1-18), even for a back-9 round (holes 10-18).
 */
export interface HoleEntry {
  holeNumber: number
  par: number
  handicap: number
  yardage: number
  /** Strokes taken. Required to consider the hole "entered". */
  score?: number
  /** Fairway hit — only meaningful for par 4/5; left undefined for par 3s. */
  fairwayHit?: boolean
  /** Putts — optional manual entry. Enables GIR derivation when present. */
  putts?: number
  /**
   * Greens in regulation, derived when putts are known:
   *   gir = (score - putts) <= (par - 2)
   * Left undefined when putts weren't entered (GIR "not tracked" for that hole).
   */
  gir?: boolean
}

export interface Round {
  id: string
  courseId: number
  /** Denormalized for history display without a course lookup. */
  courseName: string
  clubName: string
  gender: Gender
  teeName: string
  roundLength: RoundLength
  status: RoundStatus
  /** ISO timestamp — when the round was played/started. */
  date: string
  holes: HoleEntry[]
  notes?: string
  /** Calculated on save; sum of entered hole scores. */
  totalScore?: number
  /** Calculated on save; sum of par across the round's holes. */
  totalPar?: number
  /** ISO timestamp of the last edit (draft auto-save or post-round edit). */
  updatedAt: string

  // --- Phase 2 sync bookkeeping (local-only; never surfaced to the UI as
  // round data — these drive the sync engine). All are optional on the TS type
  // so existing fixtures/constructors need not set them, but the Dexie
  // migration + roundsRepo guarantee they are populated on every persisted row.
  /**
   * Has unsynced local edits. Stored as `0 | 1` (not boolean) because Dexie
   * cannot index booleans; the push query is `where('dirty').equals(1)`.
   */
  dirty?: 0 | 1
  /**
   * Tombstone marker: ISO timestamp of a soft delete. Every read path excludes
   * rounds with `deletedAt` set (PHASE2.md §11.10); backups keep them.
   */
  deletedAt?: string
  /**
   * `'local'` for rounds created before/without sign-in; the `userId` once the
   * round belongs to an account. Drives the logout rule (§11.5): on logout we
   * clear rounds whose `owner` is a userId and keep `owner === 'local'`.
   */
  owner?: 'local' | string
  /** Last server-stamped version seen — the LWW input + compare-and-clear key. */
  version?: number
  /** Last server-stamped write time (server-authoritative; not the arbiter's
   * client clock). */
  serverUpdatedAt?: string
}

/** Local user profile. Single row, id === 'profile'. */
export interface Profile {
  id: 'profile'
  name?: string
  /**
   * ISO timestamp of the last profile edit. Added in Phase 2 so the profile
   * reconciles by the same server-authoritative LWW as rounds (§11.6). Older
   * local profiles may lack it; treated as "never edited".
   */
  updatedAt?: string
}

/**
 * Singleton sync-cursor/state row (id === 'sync'). Tracks how far the client
 * has pulled and which account it is syncing. Absent until the first sync.
 */
export interface SyncState {
  id: 'sync'
  /** Server `serverTs` (epoch ms) high-water mark applied locally; the
   * `pull?since=` cursor. */
  lastPulledTs: number
  /** The account currently syncing, or null when signed out / local-only. */
  userId: string | null
}
