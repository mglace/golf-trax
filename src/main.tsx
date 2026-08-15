import React from 'react'
import ReactDOM from 'react-dom/client'
import { router } from './router'
import { AppRoot } from './AppRoot'
import { registerServiceWorker } from './pwa/registerServiceWorker'
import { initAnalytics } from './analytics/gtag'
import { startPageTracking } from './analytics/pageTracking'
import './index.css'

const rootEl = document.getElementById('root')!

// Register the SW and keep pinned home-screen installs current (autoUpdate
// reloads once a new version is found; this triggers the check on foreground).
registerServiceWorker()

// Subscribe to route changes NOW so no navigation — including the entrance page
// — is missed. trackPageView buffers these until gtag.js is initialized, so
// subscribing early costs nothing and preserves GA4's entrance-page attribution
// even if the user taps through before init runs. Only the gtag.js *load* (the
// actual cost: the largest resource + the longest main-thread tasks) is deferred
// off the critical path; running it during first paint delays LCP for no user
// benefit. A no-op when analytics is unconfigured (both functions self-guard).
startPageTracking(router)
whenIdle(() => initAnalytics())

/**
 * Run `cb` once the main thread is idle. Prefers `requestIdleCallback`; where
 * it's unavailable (e.g. iOS Safari before 18.2 — a meaningful slice of this
 * mobile-first PWA's users) falls back to firing after the `load` event plus a
 * short delay, so gtag.js still starts after first paint rather than competing
 * with it. A bare `setTimeout(cb, 1)` would run in the same frame as the initial
 * render and defer nothing.
 */
function whenIdle(cb: () => void): void {
  if (typeof window === 'undefined') return
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(cb, { timeout: 2000 })
    return
  }
  const deferred = () => window.setTimeout(cb, 500)
  if (document.readyState === 'complete') deferred()
  else window.addEventListener('load', deferred, { once: true })
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>,
)
