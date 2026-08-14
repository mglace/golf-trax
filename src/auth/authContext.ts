/**
 * Auth context + hook, split from the provider component so the provider file
 * exports only components (fast-refresh friendly). See {@link AuthProvider}.
 */
import { createContext, useContext } from 'react'

export interface LoginOptions {
  /**
   * Pre-fill the sign-in screen with this address. Set when the user has
   * already typed their email in-app (the post-save cloud prompt), so the
   * hosted login page opens filled in rather than asking a second time.
   */
  email?: string
}

export interface AuthValue {
  /** Whether account sync is configured in this build. */
  isConfigured: boolean
  /** Auth0 still resolving the session on load. */
  isLoading: boolean
  isAuthenticated: boolean
  /** Stable account id (the JWT `sub`), or null when signed out/unconfigured. */
  userId: string | null
  email: string | null
  /**
   * Start the sign-in redirect. Callers must invoke it explicitly
   * (`onClick={() => login()}`) rather than passing it straight to a handler, or
   * the DOM event lands in {@link LoginOptions}.
   */
  login: (options?: LoginOptions) => void
  logout: () => void
  /** A bearer access token, or null if one can't be obtained (offline/expired). */
  getToken: () => Promise<string | null>
}

/** Inert value used when sync is unconfigured (the local-only MVP default). */
export const INERT: AuthValue = {
  isConfigured: false,
  isLoading: false,
  isAuthenticated: false,
  userId: null,
  email: null,
  login: () => {},
  logout: () => {},
  getToken: async () => null,
}

export const AuthContext = createContext<AuthValue>(INERT)

/** Uniform auth state for the app, regardless of whether sync is configured. */
export function useAuth(): AuthValue {
  return useContext(AuthContext)
}
