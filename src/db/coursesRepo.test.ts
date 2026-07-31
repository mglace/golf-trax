import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cacheCourse,
  cacheCourses,
  cacheFullCourse,
  getCachedCourse,
  isCachedCourseComplete,
} from './coursesRepo'
import { db } from './db'
import type { ApiCourse } from '@/api/types'
import type { CachedCourse } from './types'

// A lean course as returned by GolfCourseAPI's /v1/search: no tee boxes, and a
// location with no latitude/longitude.
const leanCourse: ApiCourse = {
  id: 34,
  club_name: 'Lubbock Country Club',
  course_name: 'Lubbock Country Club',
  location: { address: '124 Golf Course Lane, Lubbock, TX', city: '', state: '', country: '' },
  tees: { male: [], female: [] },
}

// The full detail record from /v1/courses/{id}: tees + coordinates present.
const fullCourse: ApiCourse = {
  ...leanCourse,
  location: { ...leanCourse.location, city: 'Lubbock', state: 'TX', latitude: 33.5779, longitude: -101.8552 },
  tees: {
    male: [
      {
        tee_name: 'Blue', course_rating: 71.5, slope_rating: 130, bogey_rating: 0,
        total_yards: 6500, total_meters: 0, number_of_holes: 18, par_total: 72,
        front_course_rating: 0, front_slope_rating: 0, front_bogey_rating: 0,
        back_course_rating: 0, back_slope_rating: 0, back_bogey_rating: 0,
        holes: Array.from({ length: 18 }, () => ({ par: 4, yardage: 360, handicap: 1 })),
      },
    ],
    female: [],
  },
}

function stubFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    })) as unknown as typeof fetch,
  )
}

beforeEach(async () => {
  await db.courses.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('cacheFullCourse', () => {
  it('enriches a lean search result with the full detail record (tees + coords)', async () => {
    // Detail endpoint wraps the course under "course" — must be unwrapped.
    stubFetch({ course: fullCourse })
    const result = await cacheFullCourse(leanCourse)
    expect(result.tees.male).toHaveLength(1)
    expect(result.location.latitude).toBe(33.5779)

    const cached = await getCachedCourse(34)
    expect(cached?.tees.male).toHaveLength(1)
    expect(cached?.location.latitude).toBe(33.5779)
  })

  it('caches an already-complete course as-is without fetching', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await cacheFullCourse(fullCourse)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect((await getCachedCourse(34))?.tees.male).toHaveLength(1)
  })

  it('does not fetch for local manual courses (negative id)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const manual: ApiCourse = { ...leanCourse, id: -1 }
    await cacheFullCourse(manual)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(await getCachedCourse(-1)).toBeTruthy()
  })

  it('marks the enriched record hydrated so it is treated as complete', async () => {
    stubFetch({ course: fullCourse })
    await cacheFullCourse(leanCourse)
    const cached = await getCachedCourse(34)
    expect(cached?.hydrated).toBe(true)
    expect(isCachedCourseComplete(cached as CachedCourse)).toBe(true)
  })

  it('falls back to caching the lean result when the detail fetch fails', async () => {
    stubFetch({ error: 'boom' }, 500)
    const result = await cacheFullCourse(leanCourse)
    expect(result.id).toBe(34)
    // The preserved record is the LEAN one (no tees, no coordinates) — not a
    // silently-empty or complete record.
    const cached = await getCachedCourse(34)
    expect(cached).toBeTruthy()
    expect(cached?.tees.male).toHaveLength(0)
    expect(cached?.location.latitude).toBeUndefined()
    expect(cached?.hydrated).toBeUndefined()
  })
})

describe('cacheCourse does not downgrade a complete record', () => {
  it('a later lean search result keeps the full course (tees + coordinates)', async () => {
    // Full course cached first (e.g. after opening it in setup).
    await cacheCourse(fullCourse)
    // A subsequent search re-caches the same course as a lean result.
    await cacheCourses([leanCourse])
    const cached = await getCachedCourse(34)
    expect(cached?.tees.male).toHaveLength(1)
    expect(cached?.location.latitude).toBe(33.5779)
  })

  it('still upgrades a lean cached record to the full course', async () => {
    await cacheCourse(leanCourse)
    await cacheCourse(fullCourse)
    const cached = await getCachedCourse(34)
    expect(cached?.tees.male).toHaveLength(1)
    expect(cached?.location.latitude).toBe(33.5779)
  })

  it('keeps a hydrated (but tee-less) record over a later lean search result', async () => {
    // A course that legitimately has no tee boxes, hydrated from the detail
    // endpoint. hasTeeData is false, so only the hydrated flag marks it complete.
    await cacheCourse({ ...leanCourse, location: { ...fullCourse.location } }, { hydrated: true })
    await cacheCourses([leanCourse])
    const cached = await getCachedCourse(34)
    expect(cached?.hydrated).toBe(true)
    expect(cached?.location.latitude).toBe(33.5779) // detail coordinates preserved
  })
})

describe('isCachedCourseComplete', () => {
  const base = { ...leanCourse, cachedAt: 'now' } as CachedCourse
  it('is true for records with tees, a hydrated flag, or a negative id', () => {
    expect(isCachedCourseComplete({ ...base, ...fullCourse } as CachedCourse)).toBe(true)
    expect(isCachedCourseComplete({ ...base, hydrated: true })).toBe(true)
    expect(isCachedCourseComplete({ ...base, id: -1 })).toBe(true)
  })
  it('is false for a lean, non-hydrated, positive-id record', () => {
    expect(isCachedCourseComplete(base)).toBe(false)
  })
})
