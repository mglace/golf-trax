/**
 * Repository for cached courses. Wraps Dexie access so features don't touch the
 * table directly. Caching a course preserves the raw API shape and stamps
 * `cachedAt`; `lastPlayedDate` is updated separately when a round is played.
 */
import { db } from './db'
import type { CachedCourse } from './types'
import type { ApiCourse } from '@/api/types'
import { getCourseById } from '@/api/golfCourseApi'
import { hasTeeData } from '@/domain/course'
import {
  buildManualCourse,
  nextManualCourseId,
  type ManualCourseInput,
} from '@/domain/manualCourse'

/**
 * A cached record is "complete" when it carries the full detail (tee boxes), was
 * hydrated from the detail endpoint (so it's complete even if legitimately
 * tee-less), or is a local manual course (negative id). Lean `/v1/search`
 * results are not complete.
 */
export function isCachedCourseComplete(course: CachedCourse): boolean {
  return course.hydrated === true || hasTeeData(course) || course.id < 0
}

/**
 * Insert/refresh a course from an API response, preserving prior play metadata.
 * Pass `{ hydrated: true }` when `course` came from the `/v1/courses/{id}` detail
 * endpoint so the record is marked complete even if it has no tee boxes.
 */
export async function cacheCourse(
  course: ApiCourse,
  opts?: { hydrated?: boolean },
): Promise<void> {
  const existing = await db.courses.get(course.id)
  const now = new Date().toISOString()
  const hydrated = opts?.hydrated === true
  const incomingComplete = hydrated || hasTeeData(course) || course.id < 0
  // Never let a lean `/v1/search` result downgrade a complete cached record: if
  // we already hold the full course (tee boxes + coordinates from the detail
  // endpoint) and the incoming one is lean, keep the richer data. A subsequent
  // search must not strip the coordinates that "near you" relies on.
  if (existing && isCachedCourseComplete(existing) && !incomingComplete) {
    await db.courses.put({ ...existing, cachedAt: now })
    return
  }
  const record: CachedCourse = {
    ...course,
    hydrated: hydrated || undefined,
    lastPlayedDate: existing?.lastPlayedDate,
    cachedAt: now,
  }
  await db.courses.put(record)
}

/** Cache many courses at once (e.g. a page of search results). */
export async function cacheCourses(courses: ApiCourse[]): Promise<void> {
  await Promise.all(courses.map((course) => cacheCourse(course)))
}

/**
 * Cache the COMPLETE record for a course, fetching the detail endpoint when the
 * caller only has a lean `/v1/search` result. Search results omit tee boxes
 * (needed to log a round) and coordinates (needed for "near you"), so a lean
 * result is enriched via `/v1/courses/{id}` before caching. Negative ids are
 * local manual courses — already complete — and are cached as-is. If the fetch
 * fails (e.g. offline) we fall back to caching what we have so the flow can
 * still proceed. Returns the course that was cached.
 */
export async function cacheFullCourse(
  course: ApiCourse,
  signal?: AbortSignal,
): Promise<ApiCourse> {
  if (course.id > 0 && !hasTeeData(course)) {
    try {
      const full = await getCourseById(course.id, signal)
      await cacheCourse(full, { hydrated: true })
      return full
    } catch {
      // Offline / detail fetch failed — cache the lean result rather than losing it.
    }
  }
  await cacheCourse(course)
  return course
}

export async function getCachedCourse(id: number): Promise<CachedCourse | undefined> {
  return db.courses.get(id)
}

/** All cached courses (drives the "near you" proximity ranking). */
export async function getAllCachedCourses(): Promise<CachedCourse[]> {
  return db.courses.toArray()
}

/**
 * Create and cache a hand-entered course (Phase 2d). Assigns a negative id (one
 * below the most-negative existing id) so it never collides with GolfCourseAPI
 * ids, stamps `isManual`, and returns the cached record. The round-creation flow
 * then treats it like any other cached course.
 */
export async function createManualCourse(input: ManualCourseInput): Promise<CachedCourse> {
  const ids = await db.courses.toCollection().primaryKeys()
  const id = nextManualCourseId(ids as number[])
  const course = buildManualCourse(input, id)
  const record: CachedCourse = { ...course, cachedAt: new Date().toISOString(), isManual: true }
  await db.courses.put(record)
  return record
}

/** Mark a course as just-played (drives the recently-played carousel). */
export async function markCoursePlayed(id: number, when = new Date()): Promise<void> {
  await db.courses.update(id, { lastPlayedDate: when.toISOString() })
}

/**
 * Most-recently-played courses, newest first. Courses that have never been
 * played (no lastPlayedDate) are excluded.
 */
export async function getRecentlyPlayed(limit = 10): Promise<CachedCourse[]> {
  const all = await db.courses.toArray()
  return all
    .filter((c): c is CachedCourse & { lastPlayedDate: string } => Boolean(c.lastPlayedDate))
    .sort((a, b) => b.lastPlayedDate.localeCompare(a.lastPlayedDate))
    .slice(0, limit)
}
