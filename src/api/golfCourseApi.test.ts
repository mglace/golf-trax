import { describe, it, expect, vi, afterEach } from 'vitest'
import { getCourseById, ApiError } from './golfCourseApi'
import type { ApiCourse } from './types'

const course: ApiCourse = {
  id: 34,
  club_name: 'Lubbock Country Club',
  course_name: 'Lubbock Country Club',
  location: { address: '', city: 'Lubbock', state: 'TX', country: 'US', latitude: 33.5, longitude: -101.8 },
  tees: { male: [], female: [] },
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

afterEach(() => vi.unstubAllGlobals())

describe('getCourseById', () => {
  it('unwraps the { course: {...} } envelope from the detail endpoint', async () => {
    stubFetch({ course })
    const result = await getCourseById(34)
    expect(result.id).toBe(34)
    expect(result.location.latitude).toBe(33.5)
  })

  it('also accepts a bare course object (defensive)', async () => {
    stubFetch(course)
    const result = await getCourseById(34)
    expect(result.id).toBe(34)
  })

  it('throws on a { course: null } body rather than returning a broken course', async () => {
    stubFetch({ course: null })
    await expect(getCourseById(34)).rejects.toBeInstanceOf(ApiError)
  })

  it('throws on an error-shaped 200 body with no numeric id', async () => {
    stubFetch({ error: 'something went wrong' })
    await expect(getCourseById(34)).rejects.toBeInstanceOf(ApiError)
  })

  it('surfaces a 404 as a not-found ApiError', async () => {
    stubFetch({ error: 'not found' }, 404)
    await expect(getCourseById(34)).rejects.toMatchObject({ kind: 'not-found' })
  })
})
