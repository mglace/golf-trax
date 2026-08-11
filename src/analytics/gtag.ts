import { analyticsConfig } from './config'
import { toRoutePattern } from './routePath'

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
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
  }
}

let initialized = false

/** The sanitized `page_location` for a pathname, stripped of query/hash/ids. */
function sanitizedLocation(pathname: string): string {
  return `${window.location.origin}${toRoutePattern(pathname)}`
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

  window.dataLayer = window.dataLayer || []
  // gtag pushes its `arguments` object (not an array) onto the dataLayer; the
  // GA library reads it positionally, so preserve that exact shape. The
  // suppression must sit on the `arguments` line itself: prefer-rest-params is
  // enabled repo-wide and a real array is not an equivalent substitute here.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments)
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
    page_title: document.title,
  })
  window.gtag('config', config.measurementId, {
    // We fire page_view ourselves on every route change (see trackPageView).
    send_page_view: false,
  })
}

/**
 * Record a page view for the given pathname. Updates the default
 * `page_location` to this route's sanitized pattern first, so every subsequent
 * hit (this page_view and the engagement events GA sends on its own) reports
 * the pattern rather than the concrete URL. GA4 derives the report path from
 * `page_location`, so no `page_path` is sent.
 */
export function trackPageView(pathname: string): void {
  if (!analyticsConfig || typeof window === 'undefined' || !window.gtag) return
  window.gtag('set', {
    page_location: sanitizedLocation(pathname),
    page_title: document.title,
  })
  window.gtag('event', 'page_view')
}

/**
 * Record a custom GA4 event. A thin, guarded pass-through to `gtag('event')`
 * for domain events worth measuring (e.g. a completed round) — inert unless
 * analytics is configured. Inherits the sanitized `page_location` set above.
 */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!analyticsConfig || typeof window === 'undefined' || !window.gtag) return
  window.gtag('event', name, params)
}
