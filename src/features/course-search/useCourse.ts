import { useEffect, useState } from 'react'
import { getCachedCourse, cacheCourse, isCachedCourseComplete } from '@/db/coursesRepo'
import { getCourseById, ApiError } from '@/api/golfCourseApi'
import type { ApiCourse } from '@/api/types'

type LoadState =
  | { status: 'loading'; course: null; error: null }
  | { status: 'success'; course: ApiCourse; error: null }
  | { status: 'error'; course: null; error: ApiError }

/**
 * Resolve a single course by id, cache-first. A complete cached record (full
 * detail: tee boxes + coordinates, or a local manual course) is returned as-is —
 * this is also the offline path. A lean record (cached from a `/v1/search`
 * result) is missing the tees and coordinates that only the detail endpoint
 * carries, so the full course is fetched, cached (marked hydrated), and returned.
 * If that fetch fails, we fall back to the lean cached copy when we have one so
 * the course still renders rather than erroring.
 *
 * Kept as a plain async function (no React) so the cache/fetch/fallback logic is
 * unit-testable in isolation.
 */
export async function resolveCourse(id: number, signal?: AbortSignal): Promise<ApiCourse> {
  const cached = await getCachedCourse(id)
  if (cached && isCachedCourseComplete(cached)) return cached
  try {
    const fetched = await getCourseById(id, signal)
    // Cache is best-effort — a write failure must not turn a successful load into
    // an error, but we await it so the hydrated record is persisted before we
    // return (a lean cached copy would otherwise be re-fetched on the next open).
    try {
      await cacheCourse(fetched, { hydrated: true })
    } catch {
      /* ignore cache write failure */
    }
    return fetched
  } catch (err) {
    if (cached) return cached
    throw err
  }
}

/**
 * Load a single course by id for the setup screen. Wraps {@link resolveCourse}
 * with React state, cancellation, and a retry.
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

    resolveCourse(id, controller.signal)
      .then((course) => {
        if (cancelled) return
        setState({ status: 'success', course, error: null })
      })
      .catch((err) => {
        if (cancelled) return
        setState({
          status: 'error',
          course: null,
          error: err instanceof ApiError ? err : new ApiError('unknown', 'Failed to load course.'),
        })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [id, retryTick])

  return { ...state, retry: () => setRetryTick((n) => n + 1) }
}
