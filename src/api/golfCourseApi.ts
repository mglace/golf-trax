/**
 * GolfCourseAPI client — dual transport.
 *
 * - **Direct mode** (local dev): when `VITE_GOLF_API_KEY` is set, call
 *   GolfCourseAPI directly with the key. Keeps `npm run dev` frictionless.
 * - **Proxy mode** (production / no client key): call the app's own `/api`
 *   endpoints, served by a managed Azure Function that holds the key
 *   server-side — so the key never ships to the browser. See `/api` + DEPLOY.md.
 *
 * The mode is decided at build time from the presence of a client key.
 */
import type { ApiCourse, SearchResponse } from './types'

const PLACEHOLDER_KEY = 'your_golfcourseapi_key_here'
const CLIENT_KEY = (import.meta.env.VITE_GOLF_API_KEY ?? '').trim()

/** True when a usable client-side key is present → talk to GolfCourseAPI directly. */
const DIRECT_MODE = CLIENT_KEY !== '' && CLIENT_KEY !== PLACEHOLDER_KEY

const DIRECT_BASE = (
  import.meta.env.VITE_GOLF_API_BASE_URL ?? 'https://api.golfcourseapi.com'
).replace(/\/+$/, '')

/** Current transport, exported for debugging/telemetry. */
export const apiMode: 'direct' | 'proxy' = DIRECT_MODE ? 'direct' : 'proxy'

/** Discriminated error type so the UI can message each failure mode precisely. */
export type ApiErrorKind =
  | 'missing-key' // key not configured (retained for UI messaging completeness)
  | 'unauthorized' // 401 — bad/expired key
  | 'not-found' // 404
  | 'rate-limited' // 429
  | 'network' // fetch threw (offline / DNS / CORS)
  | 'server' // 5xx (incl. proxy missing its server-side key)
  | 'unknown'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

const SERVICE = DIRECT_MODE ? 'GolfCourseAPI' : 'the course service'

function directHeaders(): HeadersInit {
  return { Authorization: `Bearer ${CLIENT_KEY}`, Accept: 'application/json' }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      signal,
      headers: DIRECT_MODE ? directHeaders() : { Accept: 'application/json' },
    })
  } catch {
    // fetch() only rejects on network-layer failures (offline, DNS, CORS).
    throw new ApiError('network', `Could not reach ${SERVICE}. Check your connection and try again.`)
  }

  if (!res.ok) throw errorForStatus(res.status)

  try {
    return (await res.json()) as T
  } catch {
    throw new ApiError('unknown', `${SERVICE} returned an unexpected response.`)
  }
}

function errorForStatus(status: number): ApiError {
  switch (status) {
    case 401:
      return new ApiError('unauthorized', 'The GolfCourseAPI key was rejected (401).', status)
    case 404:
      return new ApiError('not-found', 'Course not found.', status)
    case 429:
      return new ApiError('rate-limited', 'Too many requests — please slow down.', status)
    default:
      if (status >= 500)
        return new ApiError('server', `${SERVICE} is having trouble right now.`, status)
      return new ApiError('unknown', `Unexpected response from ${SERVICE} (${status}).`, status)
  }
}

/**
 * Search courses by course or club name. Partial terms match by default
 * (fuzzy). Returns full course objects (tees + holes included).
 *
 * @param signal optional AbortSignal to cancel in-flight requests (debounce).
 */
export async function searchCourses(query: string, signal?: AbortSignal): Promise<ApiCourse[]> {
  const trimmed = query.trim()
  if (trimmed === '') return []
  const params = new URLSearchParams({ search_query: trimmed })
  const url = DIRECT_MODE
    ? `${DIRECT_BASE}/v1/search?${params.toString()}`
    : `/api/search?${params.toString()}`
  const data = await getJson<SearchResponse>(url, signal)
  return data.courses ?? []
}

/**
 * Fetch a single course by its numeric API id. Unlike `/v1/search` (which wraps
 * its results in `{ courses: [...] }`), the detail endpoint wraps the course in
 * `{ course: {...} }`. Unwrap it defensively — accept a bare course too — so the
 * caller always gets a real {@link ApiCourse} rather than the envelope (whose
 * `id`/`tees` would be `undefined`).
 */
export async function getCourseById(id: number, signal?: AbortSignal): Promise<ApiCourse> {
  const url = DIRECT_MODE ? `${DIRECT_BASE}/v1/courses/${id}` : `/api/courses/${id}`
  const data = await getJson<{ course?: ApiCourse } & Partial<ApiCourse>>(url, signal)
  return (data.course ?? (data as ApiCourse))
}
