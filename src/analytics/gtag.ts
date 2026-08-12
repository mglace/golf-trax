import { analyticsConfig } from './config'
import { toRoutePattern, toRouteTitle } from './routePath'

/**
 * The side-effecting Google Analytics (GA4) glue: loads `gtag.js` on demand and
 * exposes thin, guarded helpers the rest of the app calls. Every entry point is
 * a no-op unless {@link analyticsConfig} is set (see `config.ts`), so importing
 * this module is always safe — nothing loads and no request is made in a
 * local-only build.
 *
 * Privacy model: the app's focused flows carry opaque ids in the URL
 * (`/round/<uuid>`). We never want those to reach Google, so the sanitized
 * route pattern is installed as the **default** `page_location` via
 * `gtag('set', …)` — not merely passed on the manual `page_view`. That matters
 * because GA4 emits hits we don't call directly (`session_start`,
 * `first_visit`, the `user_engagement` heartbeats); those inherit whatever
 * `page_location` is currently set, so the default has to already be
 * sanitized or they'd carry the real `location.href`.
 *
 * Note on Enhanced Measurement: GA4's stream-level "Page changes based on
 * browser history events" fires its own `page_view` on `pushState` using the
 * real URL, which would re-introduce the id and double-count. Because we track
 * SPA navigations manually here, that toggle must be **disabled** on stream
 * `VITE_GA_MEASUREMENT_ID` (GA Admin → Data Streams → Enhanced Measurement).
 *
 * Page views are sent manually on route changes (SPAs navigate without a full
 * document load), hence `send_page_view: false` on the initial config.
 */

declare global {
  interface Window {
    // Optional: these exist only after initAnalytics() has run in a configured
    // build. Declaring them optional keeps the `!window.gtag` guards below
    // honest and stops unrelated code from calling window.gtag() with no type
    // error before it's wired up.
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

let initialized = false

/** The sanitized `page_location` for a pathname, stripped of query/hash/ids. */
function sanitizedLocation(pathname: string): string {
  return `${window.location.origin}${toRoutePattern(pathname)}`
}

/**
 * Whether the current URL opts into GA4 debug mode via `?ga_debug=1` (or
 * `=true`). Pure so it can be unit-tested. This only flips `debug_mode` — it
 * does NOT bypass the config gate in `config.ts`: analytics still activates
 * only with a real measurement id in a production build, so dev/test builds
 * stay inert regardless of the param. It exists so that, on a build where GA
 * is genuinely live, appending `?ga_debug=1` routes hits into GA4 DebugView
 * (Admin → DebugView) for verification, without the browser extension.
 */
export function wantsGaDebug(search: string): boolean {
  const value = new URLSearchParams(search).get('ga_debug')
  return value === '1' || value === 'true'
}

/**
 * Inject `gtag.js` and initialize GA4. Safe to call unconditionally and more
 * than once — it returns early when analytics is unconfigured, when there's no
 * DOM (SSR / tests), or when it has already run.
 */
export function initAnalytics(): void {
  const config = analyticsConfig
  if (!config) return
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (initialized) return
  initialized = true

  // Capture the array locally so the closure below doesn't have to re-narrow
  // the now-optional window.dataLayer on every call (it's the same array).
  const dataLayer = (window.dataLayer = window.dataLayer ?? [])
  // gtag pushes its `arguments` object (not an array) onto the dataLayer; the
  // GA library reads it positionally, so preserve that exact shape. The
  // suppression must sit on the `arguments` line itself: prefer-rest-params is
  // enabled repo-wide and a real array is not an equivalent substitute here.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments)
  }

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
    config.measurementId,
  )}`
  document.head.appendChild(script)

  window.gtag('js', new Date())
  // Install the sanitized location as the default BEFORE config, so the
  // session_start / first_visit hits bundled with the first event never carry
  // the raw landing URL.
  window.gtag('set', {
    page_location: sanitizedLocation(window.location.pathname),
    page_title: toRouteTitle(window.location.pathname),
  })

  const debug = wantsGaDebug(window.location.search)
  window.gtag('config', config.measurementId, {
    // We fire page_view ourselves on every route change (see trackPageView).
    send_page_view: false,
    // `?ga_debug=1` → route this client's hits to GA4 DebugView for
    // verification. Omitted entirely for normal visitors, so real reports are
    // unaffected.
    ...(debug ? { debug_mode: true } : {}),
  })
  if (debug) {
    console.info('[analytics] GA4 debug_mode enabled — hits go to DebugView.')
  }
}

/**
 * Dispatch to `gtag`, swallowing any throw from the live `gtag.js`. Both public
 * tracking helpers fire from inside app flow — `trackEvent` right after
 * persisting a round and before navigating (CourseSetupPage / RoundSummaryPage),
 * `trackPageView` from the router `subscribe` callback during a navigation —
 * where an uncaught throw could strand a persisted round or bubble out of a
 * router subscriber. Analytics is a best-effort side effect, so a dropped hit
 * must never surface to that path.
 */
function safeGtag(gtag: NonNullable<Window['gtag']>, ...args: unknown[]): void {
  try {
    gtag(...args)
  } catch {
    // Best-effort: never let an analytics failure break app flow.
  }
}

/**
 * Record a page view for the given pathname. Updates the default
 * `page_location` to this route's sanitized pattern (and the matching
 * `page_title`) first, so every subsequent hit — this page_view and the
 * engagement events GA sends on its own — reports the pattern rather than the
 * concrete URL. GA4 derives the report path from `page_location`, so no
 * `page_path` is sent.
 */
export function trackPageView(pathname: string): void {
  const gtag = typeof window !== 'undefined' ? window.gtag : undefined
  if (!analyticsConfig || !gtag) return
  safeGtag(gtag, 'set', {
    page_location: sanitizedLocation(pathname),
    page_title: toRouteTitle(pathname),
  })
  safeGtag(gtag, 'event', 'page_view')
}

/**
 * Record a custom GA4 event. A thin, guarded pass-through to `gtag('event')`
 * for domain events worth measuring (e.g. a completed round) — inert unless
 * analytics is configured. Inherits the sanitized `page_location` set above.
 * Failures are swallowed (see {@link safeGtag}), so a call from inside the round
 * create/finalize path can never surface an analytics error to that flow.
 */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  const gtag = typeof window !== 'undefined' ? window.gtag : undefined
  if (!analyticsConfig || !gtag) return
  safeGtag(gtag, 'event', name, params)
}
