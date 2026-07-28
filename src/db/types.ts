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
}

/** Local-only user profile. Single row, id === 'profile'. */
export interface Profile {
  id: 'profile'
  name?: string
}
