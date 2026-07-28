import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { syncConfig } from './auth/authConfig'
import { AuthContext, INERT } from './auth/authContext'
import './index.css'

const rootEl = document.getElementById('root')!

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
