/**
 * Auth surface for optional Phase 2 sync.
 *
 * The rest of the app uses {@link useAuth} (from `./authContext`), whose shape
 * is identical whether or not Auth0 is configured, so no component branches on
 * it. When sync is unconfigured (the MVP default) the provider supplies the
 * inert value and Auth0's SDK is never mounted. When configured, an inner
 * component adapts `@auth0/auth0-react` into the same shape.
 *
 * Offline tolerance (PHASE2.md §4): the Auth0 client caches into localStorage
 * and uses refresh tokens, so a signed-in session survives reloads;
 * {@link AuthValue.getToken} resolves to null (rather than throwing) when a
 * token can't be obtained offline — the caller treats that as "sync paused".
 */
import { type ReactNode } from 'react'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import { syncConfig } from './authConfig'
import { AuthContext, INERT, type AuthValue } from './authContext'

function ConfiguredAuth({ children }: { children: ReactNode }) {
  const a0 = useAuth0()
  const value: AuthValue = {
    isConfigured: true,
    isLoading: a0.isLoading,
    isAuthenticated: a0.isAuthenticated,
    userId: a0.user?.sub ?? null,
    email: a0.user?.email ?? null,
    login: () => void a0.loginWithRedirect(),
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

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!syncConfig) {
    return <AuthContext.Provider value={INERT}>{children}</AuthContext.Provider>
  }
  return (
    <Auth0Provider
      domain={syncConfig.domain}
      clientId={syncConfig.clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: syncConfig.audience,
      }}
      cacheLocation="localstorage"
      useRefreshTokens
    >
      <ConfiguredAuth>{children}</ConfiguredAuth>
    </Auth0Provider>
  )
}
