/**
 * The Auth0-backed auth bridge, mounted ONLY for sync-enabled builds and loaded
 * via a dynamic import from `main.tsx` (PHASE2.md §10 — don't regress the
 * local-only experience: a local-only build never downloads the Auth0 SDK).
 *
 * It adapts `@auth0/auth0-react` into the app's uniform {@link AuthValue}
 * (see `./authContext`) and **reports** it upward via `onValue` rather than
 * wrapping the app. This lets `main.tsx` render the router — and paint the
 * first screen — immediately, while this heavy SDK chunk (mostly unused on the
 * first paint) loads in a sibling subtree. Once loaded, it pushes the live auth
 * value up to the always-mounted `AuthContext.Provider`, so the router never
 * remounts (which would flick the LCP element and defeat the point).
 *
 * Offline tolerance (§4): the client caches into localStorage and uses refresh
 * tokens, so a signed-in session survives reloads, and {@link AuthValue.getToken}
 * resolves to null (rather than throwing) when a token can't be obtained
 * offline — the caller treats that as "sync paused".
 */
import { useEffect } from 'react'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import type { SyncConfig } from './authConfig'
import type { AuthValue } from './authContext'

/**
 * Lives inside {@link Auth0Provider} (so `useAuth0` works) but renders nothing —
 * it exists only to derive the app's {@link AuthValue} and report it upward.
 * `useAuth0()` returns a fresh object only when the auth state actually changes,
 * so the effect fires (and reports) exactly on those transitions.
 */
function AuthReporter({ onValue }: { onValue: (value: AuthValue) => void }) {
  const a0 = useAuth0()
  useEffect(() => {
    onValue({
      isConfigured: true,
      isLoading: a0.isLoading,
      isAuthenticated: a0.isAuthenticated,
      userId: a0.user?.sub ?? null,
      email: a0.user?.email ?? null,
      login: () => void a0.loginWithRedirect(),
      logout: () =>
        void a0.logout({ logoutParams: { returnTo: window.location.origin } }),
      getToken: async () => {
        try {
          return await a0.getAccessTokenSilently()
        } catch {
          // No network / expired refresh → "sync paused", never a thrown error.
          return null
        }
      },
    })
  }, [a0, onValue])
  return null
}

export default function Auth0Root({
  config,
  onValue,
}: {
  config: SyncConfig
  onValue: (value: AuthValue) => void
}) {
  return (
    <Auth0Provider
      domain={config.domain}
      clientId={config.clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: config.audience,
      }}
      cacheLocation="localstorage"
      useRefreshTokens
    >
      <AuthReporter onValue={onValue} />
    </Auth0Provider>
  )
}
