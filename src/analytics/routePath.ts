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

  return path || '/'
}
