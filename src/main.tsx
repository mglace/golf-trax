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

// Defer optional Google Analytics off the critical load path. gtag.js is the
// single largest resource and the source of the longest main-thread tasks, so
// loading it during first paint delays LCP for no user benefit. We wait for the
// first idle window, then init + start page tracking together — startPageTracking
// fires the initial page_view itself (and no-ops entirely when analytics is
// unconfigured), so nothing is lost by deferring the pair as a unit.
function whenIdle(cb: () => void): void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(cb, { timeout: 2000 })
  } else {
    setTimeout(cb, 1)
  }
}
whenIdle(() => {
  initAnalytics()
  startPageTracking(router)
})

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>,
)
