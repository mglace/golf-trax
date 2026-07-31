import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveCourse, seedCourse } from './useCourse'
import { cacheCourse, getCachedCourse } from '@/db/coursesRepo'
import { db } from '@/db/db'
import type { ApiCourse } from '@/api/types'

const leanCourse: ApiCourse = {
  id: '34',
  club_name: 'Lubbock Country Club',
  course_name: 'Lubbock Country Club',
  location: { address: '124 Golf Course Lane', city: '', state: '', country: '' },
  tees: { male: [], female: [] },
}

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

function stubFetch(handler: () => { status: number; body: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const { status, body } = handler()
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as Response
    }),
  )
}

beforeEach(async () => {
  await db.courses.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('resolveCourse', () => {
  it('returns a complete cached course without fetching', async () => {
    await cacheCourse(fullCourse)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await resolveCourse('34')
    expect(result.tees.male).toHaveLength(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('enriches a lean cached course via the detail endpoint and caches it (hydrated)', async () => {
    await cacheCourse(leanCourse)
    stubFetch(() => ({ status: 200, body: { course: fullCourse } }))
    const result = await resolveCourse('34')
    expect(result.tees.male).toHaveLength(1)
    expect(result.location.latitude).toBe(33.5779)
    const cached = await getCachedCourse('34')
    expect(cached?.hydrated).toBe(true)
    expect(cached?.tees.male).toHaveLength(1)
  })

  it('fetches when the course is not cached at all (deep-link)', async () => {
    stubFetch(() => ({ status: 200, body: { course: fullCourse } }))
    const result = await resolveCourse('34')
    expect(result.id).toBe('34')
    expect(result.tees.male).toHaveLength(1)
  })

  it('falls back to the lean cached copy when the detail fetch fails (offline)', async () => {
    await cacheCourse(leanCourse)
    stubFetch(() => ({ status: 500, body: { error: 'down' } }))
    const result = await resolveCourse('34')
    expect(result.id).toBe('34')
    expect(result.tees.male).toHaveLength(0) // lean copy, no hard error
  })

  it('rejects when nothing is cached and the fetch fails', async () => {
    stubFetch(() => ({ status: 500, body: { error: 'down' } }))
    await expect(resolveCourse('34')).rejects.toBeTruthy()
  })

  it('does not re-fetch a hydrated but tee-less course', async () => {
    await cacheCourse({ ...leanCourse }, { hydrated: true })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await resolveCourse('34')
    expect(result.id).toBe('34')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('seedCourse (selection-flow passthrough)', () => {
  it('returns a complete course when it matches the requested id', () => {
    // The setup screen renders this directly — no by-id cache read-back or
    // detail re-fetch — so selection can never dead-end at "not found".
    expect(seedCourse('34', fullCourse)).toBe(fullCourse)
  })

  it('accepts a local manual course (manual id)', () => {
    const manual: ApiCourse = { ...fullCourse, id: 'manual-1' }
    expect(seedCourse('manual-1', manual)).toBe(manual)
  })

  it('rejects a lean course with no tee data so setup re-resolves by id', () => {
    // cacheFullCourse returns the lean search result when the detail fetch
    // failed; seeding it would strand setup on the "no tee data" message
    // instead of letting resolveCourse re-attempt the detail fetch.
    expect(seedCourse('34', leanCourse)).toBeUndefined()
  })

  it('ignores a course whose id does not match (stale navigation state)', () => {
    expect(seedCourse('99', fullCourse)).toBeUndefined()
  })

  it('returns undefined when no course was handed over', () => {
    expect(seedCourse('34', undefined)).toBeUndefined()
  })

  it('returns undefined for an invalid id even if a course is present', () => {
    expect(seedCourse(undefined, fullCourse)).toBeUndefined()
    expect(seedCourse('', fullCourse)).toBeUndefined()
  })
})
