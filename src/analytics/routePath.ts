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
 * This is the single control preventing opaque ids from reaching GA, so the
 * fallback is defensive: any path without an explicit rule still has its
 * id-looking segments (uuid, all-numeric, long hex, or a long token carrying a
 * digit) collapsed to `:id` rather than forwarded verbatim. That is a
 * best-effort net, not a guarantee — a purely alphabetic opaque token would
 * still pass — so a route that carries an id must add a named rule above rather
 * than lean on the fallback.
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

  // /r/:shareId — the public share landing page. Server-rendered, so the SPA
  // does not normally route it, but a share link opened in an installed PWA can
  // land here. Named explicitly rather than left to the isIdLike fallback: a
  // share id is base64url and can come out purely alphabetic, which that net
  // does not catch (see isIdLike).
  if (segments[0] === 'r' && segments.length >= 2) return '/r/:shareId'

  if (segments[0] === 'new') {
    // /new/manual is a fixed route; /new/:courseId carries the id.
    if (segments[1] && segments[1] !== 'manual') return '/new/:courseId'
  }

  // Defensive fallback for any path not matched above: collapse each segment
  // that looks like an opaque id to `:id`, so adding e.g. `/course/:courseId`
  // to the router can't ship real ids to GA before a named rule exists here.
  // Best-effort (see isIdLike) — word-like literal segments pass through.
  if (segments.length === 0) return '/'
  return '/' + segments.map((s) => (isIdLike(s) ? ':id' : s)).join('/')
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether a path segment looks like an opaque id we should not forward to GA.
 * A best-effort deny-list of common shapes: a uuid, an all-numeric id, a long
 * hex string, or a long token carrying a digit (base64url / nanoid style —
 * opaque ids almost always include a digit). NOT exhaustive: a purely
 * alphabetic token would still pass, which is why id-bearing routes get a named
 * rule in `toRoutePattern` rather than relying on this net.
 */
function isIdLike(segment: string): boolean {
  if (UUID.test(segment)) return true
  if (/^\d+$/.test(segment)) return true
  if (/^[0-9a-f]{12,}$/i.test(segment)) return true
  return segment.length >= 12 && /^[A-Za-z0-9_-]+$/.test(segment) && /\d/.test(segment)
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
  '/r/:shareId': 'Shared round',
}

// React Router matches paths case-insensitively (AppLayout.tsx notes this), so
// `/Rounds` resolves to the same screen as `/rounds`. Index the titles by their
// lowercased pattern and look up the same way, so odd casing in a literal
// segment doesn't miss the map and split GA rows. (Lowercasing both sides also
// keeps the generated `:roundId`/`:courseId` placeholders matching.)
const TITLE_BY_LOWER_PATTERN = new Map(
  Object.entries(ROUTE_TITLES).map(([pattern, title]) => [pattern.toLowerCase(), title]),
)

export function toRouteTitle(pathname: string): string {
  const pattern = toRoutePattern(pathname)
  return TITLE_BY_LOWER_PATTERN.get(pattern.toLowerCase()) ?? pattern
}
