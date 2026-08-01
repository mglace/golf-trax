/**
 * The passwordless auth root, mounted ONLY for sync-enabled builds and loaded
 * via a dynamic import from `main.tsx` (PHASE2.md §10 — a local-only build never
 * downloads this or its client).
 *
 * It backs the app's uniform {@link AuthValue} with the embedded email-code
 * client (`./passwordlessClient`) instead of an Auth0-hosted page, and renders
 * the {@link SignInDialog} that `login()` opens. Offline tolerance (§4): the
 * session is cached in localStorage and renewed via refresh token, so a
 * signed-in session survives reloads, and {@link AuthValue.getToken} resolves to
 * null (rather than throwing) when a token can't be obtained offline — the
 * caller treats that as "sync paused".
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { clearAccountRounds } from '@/sync/syncClient'
import type { SyncConfig } from './authConfig'
import { AuthContext, type AuthValue } from './authContext'
import { SignInDialog } from './SignInDialog'
import {
  clearSession,
  decodeJwt,
  getValidAccessToken,
  loadSession,
  revokeRefreshToken,
  startEmailCode,
  verifyEmailCode,
  type StoredSession,
} from './passwordlessClient'

export default function PasswordlessRoot({
  config,
  children,
}: {
  config: SyncConfig
  children: ReactNode
}) {
  const [session, setSession] = useState<StoredSession | null>(() => loadSession())
  const [isLoading, setIsLoading] = useState<boolean>(() => loadSession() !== null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Latest session behind a ref so getToken stays stable (SyncManager keys its
  // effects on identity, not on getToken churn).
  const sessionRef = useRef(session)
  sessionRef.current = session

  const getToken = useCallback(async () => {
    const prev = sessionRef.current
    const { token, session: next } = await getValidAccessToken(config, prev)
    if (next !== prev) {
      // An involuntary sign-out (refresh token revoked/expired → next is null
      // while we had a session) must run the same §11.5 cleanup as the explicit
      // Sign out, or the previous account's rounds linger in IndexedDB while the
      // UI shows signed-out — visible to the next person on a shared device.
      if (next === null && prev !== null) await clearAccountRounds()
      setSession(next)
    }
    return token
  }, [config])

  // On mount, freshen a restored session's access token (or refresh it) so a
  // reload resumes signed-in. Routed through getToken so a revoked token at
  // mount triggers the same cleanup. Offline keeps the session; the token
  // resolves lazily later.
  useEffect(() => {
    if (!sessionRef.current) return
    let cancelled = false
    void getToken().finally(() => {
      if (!cancelled) setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [getToken])

  const login = useCallback(() => setDialogOpen(true), [])

  // Sign out: revoke the refresh token at Auth0 (best-effort/offline-tolerant),
  // clear this device's account-owned rounds (§11.5), then drop the session.
  const logout = useCallback(() => {
    const current = sessionRef.current
    if (current?.refreshToken) revokeRefreshToken(config, current.refreshToken)
    void clearAccountRounds().finally(() => {
      clearSession()
      setSession(null)
    })
  }, [config])

  // Account id (the JWT `sub`, matching what the server derives) and email for
  // display, decoded — never trusted — from the tokens.
  const identity = useMemo(() => {
    if (!session) return { userId: null as string | null, email: null as string | null }
    const sub = decodeJwt(session.accessToken).sub
    const mail = decodeJwt(session.idToken).email
    return {
      userId: typeof sub === 'string' ? sub : null,
      email: typeof mail === 'string' ? mail : null,
    }
  }, [session])

  const value: AuthValue = useMemo(
    () => ({
      isConfigured: true,
      isLoading,
      isAuthenticated: session !== null,
      userId: identity.userId,
      email: identity.email,
      login,
      logout,
      getToken,
    }),
    [isLoading, session, identity, login, logout, getToken],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
      {dialogOpen && (
        <SignInDialog
          onClose={() => setDialogOpen(false)}
          onStart={(email) => startEmailCode(config, email)}
          onVerify={async (email, code) => {
            const next = await verifyEmailCode(config, email, code)
            setSession(next)
          }}
        />
      )}
    </AuthContext.Provider>
  )
}
