/**
 * Repository for cached courses. Wraps Dexie access so features don't touch the
 * table directly. Caching a course preserves the raw API shape and stamps
 * `cachedAt`; `lastPlayedDate` is updated separately when a round is played.
 */
import { db } from './db'
import type { CachedCourse } from './types'
import type { ApiCourse } from '@/api/types'

/** Insert/refresh a course from an API response, preserving prior play metadata. */
export async function cacheCourse(course: ApiCourse): Promise<void> {
  const existing = await db.courses.get(course.id)
  const now = new Date().toISOString()
  const record: CachedCourse = {
    ...course,
    lastPlayedDate: existing?.lastPlayedDate,
    cachedAt: now,
  }
  await db.courses.put(record)
}

/** Cache many courses at once (e.g. a page of search results). */
export async function cacheCourses(courses: ApiCourse[]): Promise<void> {
  await Promise.all(courses.map(cacheCourse))
}

export async function getCachedCourse(id: number): Promise<CachedCourse | undefined> {
  return db.courses.get(id)
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
