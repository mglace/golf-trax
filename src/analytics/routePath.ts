/**
 * Normalize a concrete URL pathname into a stable route *pattern* for analytics.
 *
 * The app's focused flows carry opaque ids in the path (`/round/<uuid>`,
 * `/new/<courseId>`). Sending those verbatim to GA would (a) explode a single
 * logical screen into thousands of unique page paths, wrecking the reports, and
 * (b) leak per-round identifiers into a third-party payload. Collapsing them to
 * the route pattern (`/round/:roundId`) fixes both — the analytics view mirrors
 * the route table in `src/router.tsx`, not the specific record being viewed.
 *
 * This is the single control preventing opaque ids from reaching GA, so it
 * **fails closed**: any path without an explicit rule still has its id-looking
 * segments collapsed to `:id` (see the fallback below), rather than being
 * forwarded verbatim. That way a future parameterized route can't silently leak
 * concrete ids before a named rule is added here.
 *
 * Pure and dependency-free so it can be unit-tested in isolation and reused by
 * both the page-view tracker and any future custom events.
 */
export function toRoutePattern(pathname: string): string {
  // Drop any trailing slash (except the root) so `/rounds/` and `/rounds`
  // don't split into two rows.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const segments = path.split('/').filter(Boolean)

  if (segments[0] === 'round') {
    // /round/:roundId and /round/:roundId/summary
    if (segments[2] === 'summary') return '/round/:roundId/summary'
    if (segments.length >= 2) return '/round/:roundId'
  }

  if (segments[0] === 'new') {
    // /new/manual is a fixed route; /new/:courseId carries the id.
    if (segments[1] && segments[1] !== 'manual') return '/new/:courseId'
  }

  // Fail-closed fallback for any path not matched above: collapse each segment
  // that looks like an opaque id (uuid, all-numeric, or long hex) to `:id`, so
  // adding e.g. `/course/:courseId` to the router can't ship real ids to GA
  // before a named rule exists here. Word-like literal segments pass through.
  if (segments.length === 0) return '/'
  return '/' + segments.map((s) => (isIdLike(s) ? ':id' : s)).join('/')
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Whether a path segment looks like an opaque id (uuid, numeric, or long hex). */
function isIdLike(segment: string): boolean {
  return UUID.test(segment) || /^\d+$/.test(segment) || /^[0-9a-f]{12,}$/i.test(segment)
}

/**
 * Human-readable page title for a route, keyed by its collapsed pattern.
 *
 * GA4's default "Pages and screens" report groups by *page title*, and the app
 * never updates `document.title` per route (it stays the static "GolfTrax" from
 * index.html). Without distinct titles every route would fold into a single
 * "GolfTrax" row, hiding the very route patterns this module produces. Sending
 * a per-route title keeps that default report meaningful. Falls back to the
 * pattern itself for any route without an explicit label.
 */
const ROUTE_TITLES: Record<string, string> = {
  '/': 'Home',
  '/rounds': 'Rounds',
  '/stats': 'Stats',
  '/settings': 'Settings',
  '/new': 'Course search',
  '/new/manual': 'Manual course',
  '/new/:courseId': 'Course setup',
  '/round/:roundId': 'Round entry',
  '/round/:roundId/summary': 'Round summary',
}

export function toRouteTitle(pathname: string): string {
  const pattern = toRoutePattern(pathname)
  return ROUTE_TITLES[pattern] ?? pattern
}
