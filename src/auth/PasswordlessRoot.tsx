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
import type { SyncConfig } from './authConfig'
import { AuthContext, type AuthValue } from './authContext'
import { SignInDialog } from './SignInDialog'
import {
  clearSession,
  decodeJwt,
  getValidAccessToken,
  loadSession,
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

  // On mount, freshen a restored session's access token (or refresh it) so a
  // reload resumes signed-in. Offline keeps the session; the token resolves
  // lazily on the next getToken.
  useEffect(() => {
    if (!sessionRef.current) return
    let cancelled = false
    void (async () => {
      const { session: next } = await getValidAccessToken(config, sessionRef.current)
      if (!cancelled) {
        setSession(next)
        setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [config])

  const getToken = useCallback(async () => {
    const { token, session: next } = await getValidAccessToken(config, sessionRef.current)
    // Mirror a refreshed/cleared session so the UI + SyncManager stay in step.
    if (next !== sessionRef.current) setSession(next)
    return token
  }, [config])

  const login = useCallback(() => setDialogOpen(true), [])

  const logout = useCallback(() => {
    clearSession()
    setSession(null)
  }, [])

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
