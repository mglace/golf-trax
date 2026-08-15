import { Suspense, lazy, useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { syncConfig } from './auth/authConfig'
import { AuthContext, INERT, type AuthValue } from './auth/authContext'
import { ErrorBoundary } from './components/ErrorBoundary'

/**
 * The Auth0 SDK is a heavy, separate chunk that's almost entirely unused at
 * first paint, so it loads lazily and the router paints without waiting on it.
 * The chunk is emitted (and precached) in every build — Rollup can't see the
 * runtime `syncConfig` guard — but a local-only build never *executes* it: the
 * bridge is only rendered when `syncConfig` is set.
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
        // If the Auth0 SDK chunk fails to load (offline first session), degrade
        // to local-only (INERT) rather than blanking an already-usable app —
        // cloud sync is never a prerequisite for using GolfTrax. Falling back to
        // INERT also clears the seeded `isLoading` so the account UI doesn't
        // hang on a perpetual "Checking your session…" spinner.
        <ErrorBoundary fallback={null} onError={() => setAuth(INERT)}>
          <Suspense fallback={null}>
            <Auth0Bridge config={syncConfig} onValue={setAuth} />
          </Suspense>
        </ErrorBoundary>
      )}
      <AuthContext.Provider value={auth}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </>
  )
}
