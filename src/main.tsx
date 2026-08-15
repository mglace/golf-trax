import React from 'react'
import ReactDOM from 'react-dom/client'
import { router } from './router'
import { AppRoot } from './AppRoot'
import { registerServiceWorker } from './pwa/registerServiceWorker'
import { initAnalytics, loadGtagScript } from './analytics/gtag'
import { startPageTracking } from './analytics/pageTracking'
import './index.css'

const rootEl = document.getElementById('root')!

// Register the SW and keep pinned home-screen installs current (autoUpdate
// reloads once a new version is found; this triggers the check on foreground).
registerServiceWorker()

// Analytics: install the gtag command queue synchronously, so page views AND
// custom events (round_started / round_completed) are captured from the very
// first interaction — the shim is just an in-memory dataLayer, no network or
// parse cost. `startPageTracking` then subscribes to route changes and emits the
// entrance page_view into that queue. Only the gtag.js *script* (the largest
// resource and the longest main-thread task) is deferred off the critical path
// to the first idle window; gtag.js replays the queued commands in order once it
// loads. All no-ops when analytics is unconfigured (every entry point self-guards).
initAnalytics()
startPageTracking(router)
whenIdle(() => loadGtagScript())

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
