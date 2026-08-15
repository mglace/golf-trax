import { Suspense, lazy, useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { syncConfig } from './auth/authConfig'
import { AuthContext, INERT, type AuthValue } from './auth/authContext'

/**
 * The Auth0 SDK is a heavy, separate chunk that's almost entirely unused at
 * first paint. Load it lazily (only ever imported in a sync-enabled build — a
 * local-only build never references it) so the router can mount and paint
 * immediately.
 */
const Auth0Bridge = lazy(() => import('./auth/Auth0Root'))

/**
 * Renders the router right away with an inert (or "configured, still loading")
 * auth context. When sync is enabled, {@link Auth0Bridge} loads in a *sibling*
 * subtree and reports the live auth value up via `setAuth`; the router tree's
 * position never changes, so it re-renders with the new context instead of
 * remounting (a remount would flick the just-painted LCP element and defeat the
 * point of loading Auth0 off the critical path). Seeding
 * `isConfigured: true, isLoading: true` up front preserves the old semantics
 * (Auth0Provider starts in a loading state) for the sync engine and account UI
 * during the brief window before the bridge resolves.
 */
export function AppRoot() {
  const [auth, setAuth] = useState<AuthValue>(
    syncConfig ? { ...INERT, isConfigured: true, isLoading: true } : INERT,
  )
  return (
    <>
      {syncConfig && (
        <Suspense fallback={null}>
          <Auth0Bridge config={syncConfig} onValue={setAuth} />
        </Suspense>
      )}
      <AuthContext.Provider value={auth}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </>
  )
}
