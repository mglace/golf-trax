import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCourseSearch } from './useCourseSearch'
import { useGeolocation } from './useGeolocation'
import { SearchBar } from './SearchBar'
import { CourseCard } from './CourseCard'
import { RecentlyPlayed } from './RecentlyPlayed'
import { NearYou } from './NearYou'
import { ApiErrorMessage } from '@/components/ApiErrorMessage'
import {
  ChevronLeftIcon,
  MapPinIcon,
  PlusIcon,
  SearchIcon,
  SpinnerIcon,
  WifiOffIcon,
} from '@/components/icons'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { cacheFullCourse, getAllCachedCourses } from '@/db/coursesRepo'
import {
  courseCoords,
  sortCoursesByDistance,
  withKnownCoords,
  type Coords,
  type RankedCourse,
} from '@/domain/geo'
import type { ApiCourse } from '@/api/types'

/**
 * Course Search & Selection screen (Milestone 2). Search GolfCourseAPI, browse
 * results and recently-played courses, and pick one to continue to tee/round
 * setup.
 */
export function CourseSearchPage() {
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const { query, setQuery, status, results, error, retry } = useCourseSearch()
  // Shared across "Near you" and search results so the user only grants location once.
  const geo = useGeolocation()
  // Lets a located user switch back to the API's default order (and back again).
  const [distanceSortEnabled, setDistanceSortEnabled] = useState(true)

  // The id currently being enriched+cached before we route to setup. Fetching
  // the full course is a network round-trip, so we surface a spinner on the
  // tapped card and block further taps until it resolves.
  const [pendingId, setPendingId] = useState<number | null>(null)
  const selectAbort = useRef<AbortController | null>(null)
  // Cancel an in-flight selection if the user navigates away first.
  useEffect(() => () => selectAbort.current?.abort(), [])

  async function handleSelect(course: ApiCourse) {
    if (pendingId !== null) return // re-entrancy guard: one selection at a time
    setPendingId(course.id)
    selectAbort.current?.abort()
    const controller = new AbortController()
    selectAbort.current = controller
    // Ensure the COMPLETE course is cached before routing to setup. Search
    // results are lean (no tee boxes, no coordinates), so this fetches the full
    // detail record — giving the setup screen its tees and "near you" the
    // coordinates it needs — and works from IndexedDB even if the network drops.
    // Route to the id of the course we actually cached, NOT the search result's
    // id: the detail endpoint can canonicalize a lean result to a different
    // course id (merged/aliased records), and routing to the stale search id
    // would find nothing cached and 404 on setup ("We couldn't find that course").
    const cached = await cacheFullCourse(course, controller.signal)
    if (controller.signal.aborted) return
    // Hand the resolved course straight to setup via navigation state. The setup
    // screen then renders THIS object instead of re-reading it back from the
    // cache by id — the re-read is the step that dead-ends at "We couldn't find
    // that course" if the cache lookup misses (e.g. the detail endpoint
    // canonicalized to a different id) or a re-fetch 404s. A plain deep-link
    // carries no navigation state and still resolves by id.
    navigate(`/new/${cached.id}`, { state: { course: cached } })
  }

  const showEmpty = status === 'success' && results.length === 0
  const sortingByDistance = geo.coords !== null && distanceSortEnabled

  // Coordinates we already hold locally, keyed by course id. `/v1/search` results
  // are lean (no lat/lng), but a course the user has opened before is cached with
  // full detail — including coordinates — so we can still rank those by distance
  // without any extra network calls.
  const cachedCourses = useLiveQuery(() => getAllCachedCourses(), [], [])
  const cachedCoordsById = useMemo(() => {
    const map = new Map<number, Coords>()
    for (const course of cachedCourses) {
      const coords = courseCoords(course)
      if (coords) map.set(course.id, coords)
    }
    return map
  }, [cachedCourses])

  // When the user has shared their location and hasn't opted out, rank results
  // nearest-first (borrowing cached coordinates where a lean result has none);
  // courses with no coordinates available sink to the bottom in API order.
  const rankedResults = useMemo<RankedCourse[]>(() => {
    if (sortingByDistance && geo.coords) {
      return sortCoursesByDistance(withKnownCoords(results, cachedCoordsById), geo.coords)
    }
    return results.map((course) => ({ course, distanceMeters: null }))
  }, [results, geo.coords, sortingByDistance, cachedCoordsById])
  const hasDistances = rankedResults.some((r) => r.distanceMeters !== null)

  return (
    <div className="py-4">
      <header className="mb-4 flex items-center gap-1">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Back"
          className="-ml-2 rounded-full p-2 text-slate-500 hover:bg-slate-100"
        >
          <ChevronLeftIcon className="h-6 w-6" aria-hidden />
        </button>
        <h1 className="text-xl font-bold tracking-tight">New round</h1>
      </header>

      <SearchBar value={query} onChange={setQuery} loading={status === 'loading'} />

      {!online && (
        <div
          role="status"
          className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <WifiOffIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            You’re offline. Searching for new courses needs a connection, but you can still start a
            round at a recently-played course below.
          </p>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {status === 'error' && error && <ApiErrorMessage error={error} onRetry={retry} />}

        {status === 'idle' && query.trim().length < 2 && (
          <>
            <NearYou geo={geo} onSelect={handleSelect} />
            <RecentlyPlayed onSelect={handleSelect} />
            <div className="mt-6 flex flex-col items-center gap-2 py-8 text-center text-slate-500">
              <SearchIcon className="h-8 w-8" aria-hidden />
              <p className="text-sm">Search for a course by name or city to get started.</p>
              <button
                type="button"
                onClick={() => navigate('/new/manual')}
                className="mt-1 text-sm font-semibold text-fairway-700 underline underline-offset-2"
              >
                Or add a course manually
              </button>
            </div>
          </>
        )}

        {showEmpty && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            <p className="font-medium text-slate-700">No courses found</p>
            <p className="mt-1">Try a different spelling or search by city — or add it yourself.</p>
            <button
              type="button"
              onClick={() => navigate('/new/manual', { state: { clubName: query.trim() } })}
              className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-fairway-700 px-4 py-2.5 font-semibold text-white active:bg-fairway-800"
            >
              <PlusIcon className="h-5 w-5" aria-hidden />
              Add this course manually
            </button>
          </div>
        )}

        {status === 'success' && results.length > 0 && (
          <>
            {geo.status !== 'unsupported' && (
              <div className="flex items-center justify-between px-1">
                <p role="status" aria-live="polite" className="text-xs text-slate-500">
                  {sortingByDistance && hasDistances
                    ? 'Sorted by distance'
                    : `${results.length} ${results.length === 1 ? 'result' : 'results'}`}
                </p>
                {geo.coords ? (
                  // Already located: toggle distance sorting on/off without re-prompting.
                  <button
                    type="button"
                    onClick={() => setDistanceSortEnabled((on) => !on)}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-fairway-700 active:text-fairway-800"
                  >
                    <MapPinIcon className="h-4 w-4" aria-hidden />
                    {distanceSortEnabled ? 'Show default order' : 'Sort by distance'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => geo.request()}
                    disabled={geo.status === 'prompting'}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-fairway-700 active:text-fairway-800 disabled:opacity-60"
                  >
                    {geo.status === 'prompting' ? (
                      <SpinnerIcon className="h-4 w-4" aria-hidden />
                    ) : (
                      <MapPinIcon className="h-4 w-4" aria-hidden />
                    )}
                    {geo.status === 'prompting'
                      ? 'Locating…'
                      : geo.status === 'idle'
                        ? 'Sort by distance'
                        : 'Try again'}
                  </button>
                )}
              </div>
            )}
            {geo.status === 'denied' && !geo.coords && (
              <p className="px-1 text-xs text-slate-500">
                Location access is blocked. Allow it in your browser settings to sort by distance.
              </p>
            )}
            {geo.status === 'error' && !geo.coords && (
              <p className="px-1 text-xs text-slate-500">
                Couldn’t get your location. Please try again.
              </p>
            )}
            <ul className="space-y-2">
              {rankedResults.map(({ course, distanceMeters }) => (
                <li key={course.id}>
                  <CourseCard
                    course={course}
                    onSelect={handleSelect}
                    distanceMeters={distanceMeters}
                    pending={pendingId === course.id}
                    disabled={pendingId !== null && pendingId !== course.id}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
