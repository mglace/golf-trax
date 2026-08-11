import { analyticsConfig } from './config'
import { toRoutePattern } from './routePath'

/**
 * The side-effecting Google Analytics (GA4) glue: loads `gtag.js` on demand and
 * exposes thin, guarded helpers the rest of the app calls. Every entry point is
 * a no-op unless {@link analyticsConfig} is set (see `config.ts`), so importing
 * this module is always safe — nothing loads and no request is made in a
 * local-only build.
 *
 * Page views are sent manually on route changes (SPAs navigate without a full
 * document load, so the automatic pageview would only ever fire once), hence
 * `send_page_view: false` on the initial config.
 */

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
  }
}

let initialized = false

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
  // GA library reads it positionally, so preserve that shape.
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
  window.gtag('config', config.measurementId, {
    // We fire page_view ourselves on every route change (see trackPageView).
    send_page_view: false,
  })
}

/**
 * Record a page view for the given pathname. The path is collapsed to its route
 * pattern first so opaque round/course ids never reach GA (see toRoutePattern).
 */
export function trackPageView(pathname: string): void {
  if (!analyticsConfig || typeof window === 'undefined' || !window.gtag) return
  const path = toRoutePattern(pathname)
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: `${window.location.origin}${path}`,
    page_title: document.title,
  })
}

/**
 * Record a custom GA4 event. A thin, guarded pass-through to `gtag('event')`
 * for domain events worth measuring (e.g. a completed round) — inert unless
 * analytics is configured.
 */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!analyticsConfig || typeof window === 'undefined' || !window.gtag) return
  window.gtag('event', name, params)
}
