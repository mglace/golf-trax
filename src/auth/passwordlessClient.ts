/**
 * Embedded Auth0 passwordless email-code client (PHASE2.md §4).
 *
 * We deliberately do NOT use Auth0's hosted Universal Login page. The New
 * Universal Login experience doesn't support the passwordless flow, and the
 * Classic hosted page is fragile to get loading at all — that redirect was the
 * entire failure mode of the earlier magic-link attempt. Instead the SPA
 * renders its own email/code form and talks to Auth0's passwordless + token
 * endpoints directly:
 *
 *   1. POST /passwordless/start   → Auth0 emails a short numeric code
 *   2. POST /oauth/token          → exchange (email, code) for tokens
 *   3. POST /oauth/token (refresh)→ silent renewal while signed in
 *
 * There is no client secret (a public SPA client). Tokens are cached in
 * localStorage so a signed-in session survives reloads and works offline; the
 * server stays the sole authority — it verifies the access token's signature,
 * issuer, audience, and `sub` on every /api/sync call (api/src/auth.js). This
 * client never grants access on its own; the JWTs it obtains are the only thing
 * the backend trusts.
 */

export interface PasswordlessConfig {
  /** Auth0 domain, no scheme (e.g. `auth.golftrax.app`). */
  domain: string
  /** The SPA application's Client ID (public). */
  clientId: string
  /** The GolfTrax API identifier the access token is minted for. */
  audience: string
}

/** A signed-in session, mirrored to localStorage so reloads resume it. */
export interface StoredSession {
  accessToken: string
  idToken: string
  /** Present when `offline_access` was granted; enables silent renewal. */
  refreshToken: string | null
  /** Epoch ms at which {@link accessToken} expires. */
  expiresAt: number
}

/** An auth failure carrying Auth0's machine-readable detail for diagnosis. */
export interface AuthError extends Error {
  status?: number
  /** Auth0's `error` / `error_description`, if any (for logs, not the user). */
  detail?: string
}

// openid/profile/email → an id_token with the account email; offline_access →
// a refresh token for silent renewal. `email` connection is the passwordless
// realm configured in Auth0.
const SCOPE = 'openid profile email offline_access'
const CONNECTION = 'email'
const OTP_GRANT = 'http://auth0.com/oauth/grant-type/passwordless/otp'
const STORAGE_KEY = 'golftrax.auth.session'
// Refresh a little before real expiry so an in-flight request never races the
// token's death.
const EXPIRY_SKEW_MS = 60_000

interface TokenResponse {
  access_token: string
  id_token: string
  refresh_token?: string
  expires_in: number
}

function toSession(token: TokenResponse, prevRefresh: string | null): StoredSession {
  return {
    accessToken: token.access_token,
    idToken: token.id_token,
    // With refresh-token rotation on (what PHASE2-SETUP.md mandates) each
    // refresh returns a fresh refresh_token; fall back to the one we already
    // hold if a response omits it (e.g. rotation disabled).
    refreshToken: token.refresh_token ?? prevRefresh,
    expiresAt: Date.now() + token.expires_in * 1000,
  }
}

/** Load the persisted session, or null if none / unparsable. Never throws. */
export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as StoredSession
    if (typeof s?.accessToken !== 'string' || typeof s?.expiresAt !== 'number') return null
    return s
  } catch {
    return null
  }
}

/** Persist the session. Never throws (private-mode/full-quota tolerant). */
export function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Best-effort: an unpersisted session simply won't survive a reload.
  }
}

/** Forget the persisted session (sign-out, or an unrecoverable refresh). */
export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore — nothing more we can do to clear it.
  }
}

async function authError(res: Response, message: string): Promise<AuthError> {
  let detail = ''
  try {
    const body = (await res.json()) as { error?: string; error_description?: string }
    detail = body?.error_description || body?.error || ''
  } catch {
    // No JSON body — leave detail empty.
  }
  const err = new Error(message) as AuthError
  err.status = res.status
  err.detail = detail
  return err
}

/**
 * Step 1 — ask Auth0 to email a login code to `email`. Resolves when the send
 * is accepted; rejects with an {@link AuthError} otherwise.
 */
export async function startEmailCode(config: PasswordlessConfig, email: string): Promise<void> {
  const res = await fetch(`https://${config.domain}/passwordless/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      connection: CONNECTION,
      email,
      send: 'code',
    }),
  })
  if (!res.ok) {
    throw await authError(res, 'Couldn’t send a code to that address. Check the email and try again.')
  }
}

/**
 * Step 2 — exchange the emailed code for tokens. On success the session is
 * persisted and returned; on a bad/expired code it rejects with an
 * {@link AuthError}.
 */
export async function verifyEmailCode(
  config: PasswordlessConfig,
  email: string,
  code: string,
): Promise<StoredSession> {
  const res = await fetch(`https://${config.domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: OTP_GRANT,
      client_id: config.clientId,
      username: email,
      otp: code,
      realm: CONNECTION,
      audience: config.audience,
      scope: SCOPE,
    }),
  })
  if (!res.ok) {
    throw await authError(res, 'That code didn’t match. Check it and try again, or send a new one.')
  }
  const session = toSession((await res.json()) as TokenResponse, null)
  saveSession(session)
  return session
}

/**
 * Best-effort, fire-and-forget revocation of a refresh token at Auth0 (called on
 * sign-out). Ending the server session must not block a local — possibly
 * offline — logout, so failures are ignored; the local session is cleared
 * regardless by the caller. Without this the refresh token stays valid at Auth0
 * for its full lifetime after sign-out.
 */
export function revokeRefreshToken(config: PasswordlessConfig, refreshToken: string): void {
  void fetch(`https://${config.domain}/oauth/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: config.clientId, token: refreshToken }),
  }).catch(() => {
    // Offline or rejected — nothing to do; local sign-out still proceeds.
  })
}

/**
 * The outcome of a refresh attempt:
 *  - `renewed`  — a fresh session (persisted);
 *  - `retry`    — transient (offline, 429 rate-limit, 5xx): KEEP the session
 *                 and try again later ("sync paused");
 *  - `cleared`  — permanent (refresh token revoked/expired): the session has
 *                 been dropped and the user must re-authenticate.
 */
type RefreshOutcome =
  | { status: 'renewed'; session: StoredSession }
  | { status: 'retry' }
  | { status: 'cleared' }

// Single-flight guard: on reload the mount effect and SyncManager's first sync
// can both hit an expired token and refresh concurrently. With rotation on, a
// second POST with the same refresh token is reuse-detection at Auth0 and
// revokes the whole token family — so concurrent callers must share one request.
let pendingRefresh: { token: string; promise: Promise<RefreshOutcome> } | null = null

async function performRefresh(
  config: PasswordlessConfig,
  session: StoredSession,
): Promise<RefreshOutcome> {
  let res: Response
  try {
    res = await fetch(`https://${config.domain}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        refresh_token: session.refreshToken,
      }),
    })
  } catch {
    // Offline / transient network error — keep the session, resume later.
    return { status: 'retry' }
  }
  if (!res.ok) {
    // Only genuinely unrecoverable auth failures are permanent. A 429 (Auth0
    // tenant rate limit) or a 5xx is transient — keep the session and retry, or
    // a rate-limited reload would sign the user out.
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      clearSession()
      return { status: 'cleared' }
    }
    return { status: 'retry' }
  }
  const next = toSession((await res.json()) as TokenResponse, session.refreshToken)
  saveSession(next)
  return { status: 'renewed', session: next }
}

function refreshSession(
  config: PasswordlessConfig,
  session: StoredSession,
): Promise<RefreshOutcome> {
  const token = session.refreshToken
  // No refresh token → we can't renew silently; keep the session paused rather
  // than forcing a sign-out (offline_access simply wasn't granted).
  if (!token) return Promise.resolve({ status: 'retry' })
  if (pendingRefresh && pendingRefresh.token === token) return pendingRefresh.promise
  const promise = performRefresh(config, session).finally(() => {
    if (pendingRefresh && pendingRefresh.token === token) pendingRefresh = null
  })
  pendingRefresh = { token, promise }
  return promise
}

/**
 * Resolve a currently-valid access token, refreshing if needed. Returns the
 * session alongside the token so the caller can mirror it into React state:
 *  - renewed → the fresh session;
 *  - transient failure (offline/429/5xx) → the SAME in-memory session (paused);
 *  - permanent failure (revoked/expired) → null (signed out).
 *
 * `token` is null whenever no valid token is available — callers treat that as
 * "sync paused", never an error.
 */
export async function getValidAccessToken(
  config: PasswordlessConfig,
  session: StoredSession | null,
): Promise<{ token: string | null; session: StoredSession | null }> {
  if (!session) return { token: null, session: null }
  if (Date.now() < session.expiresAt - EXPIRY_SKEW_MS) {
    return { token: session.accessToken, session }
  }
  const outcome = await refreshSession(config, session)
  if (outcome.status === 'renewed') {
    return { token: outcome.session.accessToken, session: outcome.session }
  }
  if (outcome.status === 'cleared') return { token: null, session: null }
  // Transient: hand back the same session object we were given (never
  // loadSession(), which is null when the write was silently dropped, e.g.
  // Safari private mode) so a working session isn't lost on the first offline
  // refresh. Returning the identical reference also avoids a needless
  // setSession/context churn in the caller.
  return { token: null, session }
}

/**
 * Decode a JWT payload WITHOUT verifying it — for display only (account email)
 * and to key the sync engine on a stable `sub`. Trust still lives entirely on
 * the server, which verifies the same token's signature. Returns {} on any
 * malformed input.
 */
export function decodeJwt(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1]
    if (!part) return {}
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const json = atob(padded)
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return {}
  }
}
