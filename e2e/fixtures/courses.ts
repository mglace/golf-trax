import type { Page, Route } from '@playwright/test'
import type { ApiCourse } from '../../src/api/types'

/**
 * Lean course records, mirroring the shape GolfCourseAPI's `/v1/search` returns
 * (no tee boxes, no coordinates — those only arrive from the detail endpoint).
 * Enough fields for the search cards to render name + location.
 */
export const PEBBLE_BEACH: ApiCourse = {
  id: 101,
  club_name: 'Pebble Beach Golf Links',
  course_name: 'Pebble Beach',
  location: { address: '', city: 'Pebble Beach', state: 'CA', country: 'United States' },
  tees: { male: [], female: [] },
}

export const SPYGLASS_HILL: ApiCourse = {
  id: 102,
  club_name: 'Spyglass Hill Golf Course',
  course_name: 'Spyglass Hill',
  location: { address: '', city: 'Pebble Beach', state: 'CA', country: 'United States' },
  tees: { male: [], female: [] },
}

export const SAMPLE_RESULTS: ApiCourse[] = [PEBBLE_BEACH, SPYGLASS_HILL]

/**
 * A full detail record for {@link PEBBLE_BEACH}, as `/v1/courses/{id}` returns
 * it — with a tee box so course setup has something to work with. Used by the
 * "select a course" flow, which fetches full detail before routing to setup.
 */
export const PEBBLE_BEACH_DETAIL: ApiCourse = {
  ...PEBBLE_BEACH,
  location: { ...PEBBLE_BEACH.location, latitude: 36.5686, longitude: -121.9497 },
  tees: {
    male: [
      {
        tee_name: 'Blue',
        course_rating: 74.9,
        slope_rating: 144,
        bogey_rating: 100,
        total_yards: 6828,
        total_meters: 6243,
        number_of_holes: 18,
        par_total: 72,
        front_course_rating: 37.1,
        front_slope_rating: 142,
        front_bogey_rating: 50,
        back_course_rating: 37.8,
        back_slope_rating: 146,
        back_bogey_rating: 50,
        holes: Array.from({ length: 18 }, (_, i) => ({
          par: 4,
          yardage: 380,
          handicap: i + 1,
        })),
      },
    ],
    female: [],
  },
}

// Matches both transports: proxy mode (`/api/search`, same-origin) and direct
// mode (`api.golfcourseapi.com/v1/search`). Tests run in proxy mode, but
// stubbing both keeps the helpers robust if the key is ever present. Regexes
// (not globs) so the query string can't confuse the matcher.
const SEARCH_ROUTE = /\/search\?/
const COURSE_DETAIL_ROUTE = /\/courses\/\d+/

interface SearchStub {
  /** Courses to return on a 2xx response. Ignored when `status` is an error. */
  courses?: ApiCourse[]
  /** HTTP status to return (default 200). Use 500/429/401 to exercise error UI. */
  status?: number
  /** Artificial latency, ms — lets a test observe the in-flight loading state. */
  delayMs?: number
}

/**
 * Stub the course-search endpoint. Returns a live array of the `search_query`
 * values the app actually requested, so a test can assert on debouncing and
 * query encoding.
 */
export async function stubSearch(page: Page, stub: SearchStub = {}): Promise<string[]> {
  const { courses = SAMPLE_RESULTS, status = 200, delayMs = 0 } = stub
  const queries: string[] = []

  await page.route(SEARCH_ROUTE, async (route: Route) => {
    const url = new URL(route.request().url())
    queries.push(url.searchParams.get('search_query') ?? '')

    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))

    if (status >= 400) {
      await route.fulfill({ status, contentType: 'application/json', body: '{}' })
      return
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ courses }),
    })
  })

  return queries
}

/** Stub the single-course detail endpoint used when a search result is tapped. */
export async function stubCourseDetail(page: Page, course: ApiCourse): Promise<void> {
  await page.route(COURSE_DETAIL_ROUTE, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ course }),
    })
  })
}
