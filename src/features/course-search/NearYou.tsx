import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getAllCachedCourses } from '@/db/coursesRepo'
import { nearbyCourses, formatMiles } from '@/domain/geo'
import { formatCourseName, formatLocation } from '@/domain/course'
import { MapPinIcon, SpinnerIcon } from '@/components/icons'
import { useGeolocation } from './useGeolocation'
import type { ApiCourse } from '@/api/types'

interface NearYouProps {
  onSelect: (course: ApiCourse) => void
}

/**
 * "Near you" — ranks the user's cached courses by distance from their current
 * location (Phase 2d.2). Location is only read on an explicit tap, and the whole
 * section hides itself when the browser has no Geolocation support. It surfaces
 * courses you've already looked up; discovering brand-new courses by location
 * would need a geo-search endpoint (a future addition).
 */
export function NearYou({ onSelect }: NearYouProps) {
  const { status, coords, request } = useGeolocation()
  const courses = useLiveQuery(() => getAllCachedCourses(), [], [])

  const nearby = useMemo(
    () => (coords ? nearbyCourses(courses, coords, { maxMiles: 60, limit: 6 }) : []),
    [coords, courses],
  )

  // No Geolocation API at all → don't advertise the feature.
  if (status === 'unsupported') return null

  // A re-request from the granted state: keep the current list on screen and
  // just show that we're fetching a newer fix, rather than blanking out.
  const isRefreshing = status === 'prompting' && coords !== null
  const showLocated = status === 'granted' || isRefreshing

  return (
    <section aria-labelledby="nearby-heading" className="mt-2">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="nearby-heading" className="text-sm font-semibold text-slate-600">
          Near you
        </h2>
        {(status === 'idle' || status === 'denied' || status === 'error') && (
          <button
            type="button"
            onClick={() => request()}
            className="inline-flex items-center gap-1 text-sm font-semibold text-fairway-700 active:text-fairway-800"
          >
            <MapPinIcon className="h-4 w-4" aria-hidden />
            {status === 'idle' ? 'Use my location' : 'Try again'}
          </button>
        )}
        {showLocated && (
          <button
            type="button"
            onClick={() => request({ fresh: true })}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1 text-sm font-semibold text-fairway-700 active:text-fairway-800 disabled:opacity-60"
          >
            {isRefreshing ? (
              <SpinnerIcon className="h-4 w-4" aria-hidden />
            ) : (
              <MapPinIcon className="h-4 w-4" aria-hidden />
            )}
            {isRefreshing ? 'Updating…' : 'Update location'}
          </button>
        )}
      </div>

      <div aria-live="polite">
        {status === 'idle' && (
          <p className="text-sm text-slate-500">
            Find courses you’ve looked up that are closest to where you are now.
          </p>
        )}

        {status === 'prompting' && !isRefreshing && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <SpinnerIcon className="h-4 w-4" aria-hidden />
            Getting your location…
          </p>
        )}

        {status === 'denied' && (
          <p className="text-sm text-slate-500">
            Location access is blocked. Allow it in your browser settings to see nearby courses.
          </p>
        )}

        {status === 'error' && (
          <p className="text-sm text-slate-500">Couldn’t get your location. Please try again.</p>
        )}

        {showLocated && nearby.length === 0 && (
          <p className="text-sm text-slate-500">
            No nearby courses yet — search for a course and it’ll show up here next time you’re close.
          </p>
        )}

        {showLocated && nearby.length > 0 && (
          <ul className="space-y-2">
            {nearby.map(({ course, distanceMeters }) => (
              <li key={course.id}>
                <button
                  type="button"
                  onClick={() => onSelect(course)}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-fairway-300 hover:bg-fairway-50/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {formatCourseName(course)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {formatLocation(course)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-slate-500">
                    {formatMiles(distanceMeters)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
