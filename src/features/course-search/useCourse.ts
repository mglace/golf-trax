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
 * The already-resolved course from the selection flow, but only when it actually
 * describes the id being loaded. Guards against a stale navigation-state course
 * (e.g. from the browser back/forward cache) being shown for a different course.
 */
export function seedCourse(
  id: number | undefined,
  initialCourse: ApiCourse | undefined,
): ApiCourse | undefined {
  if (id === undefined || Number.isNaN(id)) return undefined
  return initialCourse && initialCourse.id === id ? initialCourse : undefined
}

/**
 * Load a single course by id for the setup screen. Wraps {@link resolveCourse}
 * with React state, cancellation, and a retry.
 *
 * `initialCourse` is the already-resolved course handed over from the selection
 * flow (via router navigation state). When it's present and matches `id`, it's
 * rendered directly — no cache read-back or detail re-fetch — which is what
 * keeps on-course selection from dead-ending at "We couldn't find that course"
 * when the by-id resolution can't find the course again. A manual retry still
 * forces a fresh {@link resolveCourse}.
 */
export function useCourse(
  id: number | undefined,
  initialCourse?: ApiCourse,
): LoadState & { retry: () => void } {
  const seed = seedCourse(id, initialCourse)
  const [state, setState] = useState<LoadState>(() =>
    seed
      ? { status: 'success', course: seed, error: null }
      : { status: 'loading', course: null, error: null },
  )
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

    // Selection handed us the resolved course — render it as-is (a manual retry
    // clears this by bumping retryTick, falling through to a fresh resolve).
    if (retryTick === 0 && seed) {
      setState({ status: 'success', course: seed, error: null })
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
  }, [id, retryTick, seed])

  return { ...state, retry: () => setRetryTick((n) => n + 1) }
}
