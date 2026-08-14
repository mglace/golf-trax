/**
 * The Auth0-backed auth root, mounted ONLY for sync-enabled builds and loaded
 * via a dynamic import from `main.tsx` (PHASE2.md §10 — don't regress the
 * local-only experience: a local-only build never downloads the Auth0 SDK).
 *
 * It adapts `@auth0/auth0-react` into the app's uniform {@link AuthValue}
 * (see `./authContext`). Offline tolerance (§4): the client caches into
 * localStorage and uses refresh tokens, so a signed-in session survives
 * reloads, and {@link AuthValue.getToken} resolves to null (rather than
 * throwing) when a token can't be obtained offline — the caller treats that as
 * "sync paused".
 */
import { type ReactNode } from 'react'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import type { SyncConfig } from './authConfig'
import { AuthContext, type AuthValue } from './authContext'

function ConfiguredAuth({ children }: { children: ReactNode }) {
  const a0 = useAuth0()
  const value: AuthValue = {
    isConfigured: true,
    isLoading: a0.isLoading,
    isAuthenticated: a0.isAuthenticated,
    userId: a0.user?.sub ?? null,
    email: a0.user?.email ?? null,
    // With an email in hand (the post-save cloud prompt), hand Auth0 a
    // `login_hint` so its screen opens pre-filled, and target the passwordless
    // `email` connection directly — the user typed their address once, in the
    // app, and shouldn't be asked again. Without one (the Settings button), send
    // no params at all so Universal Login keeps whatever the tenant offers.
    // Returns the SDK's promise rather than discarding it, so a hand-off that
    // fails before the browser navigates surfaces to the caller instead of
    // leaving a pending UI stuck forever.
    login: (options) =>
      a0.loginWithRedirect(
        options?.email
          ? { authorizationParams: { login_hint: options.email, connection: 'email' } }
          : undefined,
      ),
    logout: () => void a0.logout({ logoutParams: { returnTo: window.location.origin } }),
    getToken: async () => {
      try {
        return await a0.getAccessTokenSilently()
      } catch {
        // No network / expired refresh → "sync paused", never a thrown error.
        return null
      }
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default function Auth0Root({
  config,
  children,
}: {
  config: SyncConfig
  children: ReactNode
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
      <ConfiguredAuth>{children}</ConfiguredAuth>
    </Auth0Provider>
  )
}
