import { useEffect, useState } from 'react'
import { getCachedCourse, cacheCourse } from '@/db/coursesRepo'
import { getCourseById, ApiError } from '@/api/golfCourseApi'
import { hasTeeData } from '@/domain/course'
import type { ApiCourse } from '@/api/types'

type LoadState =
  | { status: 'loading'; course: null; error: null }
  | { status: 'success'; course: ApiCourse; error: null }
  | { status: 'error'; course: null; error: ApiError }

/**
 * Load a single course by id, cache-first. Falls back to the API when the
 * course isn't in IndexedDB yet (e.g. a deep link / page refresh).
 */
export function useCourse(id: number | undefined): LoadState & { retry: () => void } {
  const [state, setState] = useState<LoadState>({ status: 'loading', course: null, error: null })
  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    if (id === undefined || Number.isNaN(id)) {
      setState({
        status: 'error',
        course: null,
        error: new ApiError('not-found', 'Invalid course id.'),
      })
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setState({ status: 'loading', course: null, error: null })

    ;(async () => {
      const cached = await getCachedCourse(id)
      if (cancelled) return
      // A cached record with tee data is complete — use it (also works offline).
      // A lean record (cached from a `/v1/search` result) is missing the tees
      // and coordinates that only the detail endpoint carries, so fall through
      // to fetch the full course. Local manual courses (id < 0) are always
      // complete and never re-fetched.
      if (cached && (hasTeeData(cached) || id < 0)) {
        setState({ status: 'success', course: cached, error: null })
        return
      }
      try {
        const fetched = await getCourseById(id, controller.signal)
        if (cancelled) return
        void cacheCourse(fetched)
        setState({ status: 'success', course: fetched, error: null })
      } catch (err) {
        if (cancelled) return
        // Enrichment failed (e.g. offline). Fall back to a lean cached copy if we
        // have one, so the course still renders (setup will show it has no tee
        // data) rather than a hard error.
        if (cached) {
          setState({ status: 'success', course: cached, error: null })
          return
        }
        setState({
          status: 'error',
          course: null,
          error: err instanceof ApiError ? err : new ApiError('unknown', 'Failed to load course.'),
        })
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [id, retryTick])

  return { ...state, retry: () => setRetryTick((n) => n + 1) }
}
