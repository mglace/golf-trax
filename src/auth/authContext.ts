/**
 * Auth context + hook, split from the provider component so the provider file
 * exports only components (fast-refresh friendly). See {@link AuthProvider}.
 */
import { createContext, useContext } from 'react'

export interface AuthValue {
  /** Whether account sync is configured in this build. */
  isConfigured: boolean
  /** Still resolving a restored session on load. */
  isLoading: boolean
  isAuthenticated: boolean
  /** Stable account id (the JWT `sub`), or null when signed out/unconfigured. */
  userId: string | null
  email: string | null
  login: () => void
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
