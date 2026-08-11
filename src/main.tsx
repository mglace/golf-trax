import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { syncConfig } from './auth/authConfig'
import { AuthContext, INERT } from './auth/authContext'
import { registerServiceWorker } from './pwa/registerServiceWorker'
import { initAnalytics } from './analytics/gtag'
import { startPageTracking } from './analytics/pageTracking'
import './index.css'

const rootEl = document.getElementById('root')!

// Register the SW and keep pinned home-screen installs current (autoUpdate
// reloads once a new version is found; this triggers the check on foreground).
registerServiceWorker()

// Optional Google Analytics — inert unless VITE_GA_MEASUREMENT_ID is set in a
// production build (src/analytics/config.ts). Load gtag.js, then emit a
// page_view on the initial load and on every subsequent route change.
initAnalytics()
startPageTracking(router)

/**
 * Optional sync is gated at the root: a sync-enabled build dynamically imports
 * the Auth0 root (so the SDK is a separate chunk), while the local-only MVP
 * renders with an inert auth context and never loads Auth0 at all
 * (PHASE2.md §10). Loading the SDK before the first render — rather than via a
 * Suspense swap — keeps the router from remounting.
 */
if (syncConfig) {
  const config = syncConfig
  void import('./auth/Auth0Root').then(({ default: Auth0Root }) => {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <Auth0Root config={config}>
          <RouterProvider router={router} />
        </Auth0Root>
      </React.StrictMode>,
    )
  })
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <AuthContext.Provider value={INERT}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </React.StrictMode>,
  )
}
