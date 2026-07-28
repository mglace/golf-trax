import { useCallback, useEffect, useRef, useState } from 'react'
import { searchCourses, ApiError } from '@/api/golfCourseApi'
import { cacheCourses } from '@/db/coursesRepo'
import type { ApiCourse } from '@/api/types'

export type SearchStatus = 'idle' | 'loading' | 'success' | 'error'

interface CourseSearchState {
  query: string
  setQuery: (q: string) => void
  status: SearchStatus
  results: ApiCourse[]
  error: ApiError | null
  /** Re-run the current query (e.g. a "retry" button after a network error). */
  retry: () => void
}

const DEBOUNCE_MS = 350
const MIN_QUERY_LENGTH = 2

/**
 * Debounced course search. Cancels in-flight requests when the query changes,
 * surfaces a typed {@link ApiError} for the UI, and caches successful results
 * so they're available offline later.
 */
export function useCourseSearch(): CourseSearchState {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [results, setResults] = useState<ApiCourse[]>([])
  const [error, setError] = useState<ApiError | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  // Bumped to force a re-run of the effect on retry without changing the query.
  const [retryTick, setRetryTick] = useState(0)

  const retry = useCallback(() => setRetryTick((n) => n + 1), [])

  useEffect(() => {
    const trimmed = query.trim()

    // Abort any request still in flight from a previous keystroke.
    abortRef.current?.abort()

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setStatus('idle')
      setResults([])
      setError(null)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setStatus('loading')
    setError(null)

    const timer = setTimeout(async () => {
      try {
        const courses = await searchCourses(trimmed, controller.signal)
        if (controller.signal.aborted) return
        setResults(courses)
        setStatus('success')
        // Fire-and-forget cache; don't block the UI on IndexedDB writes.
        void cacheCourses(courses)
      } catch (err) {
        if (controller.signal.aborted) return
        setResults([])
        setStatus('error')
        setError(
          err instanceof ApiError
            ? err
            : new ApiError('unknown', 'Something went wrong while searching.'),
        )
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, retryTick])

  return { query, setQuery, status, results, error, retry }
}
