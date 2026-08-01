import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSession,
  decodeJwt,
  getValidAccessToken,
  loadSession,
  saveSession,
  startEmailCode,
  verifyEmailCode,
  type StoredSession,
} from './passwordlessClient'

const CONFIG = { domain: 'auth.example.com', clientId: 'client123', audience: 'https://api.example' }

// The client persists to localStorage and talks to Auth0 over fetch; vitest
// runs in Node, so we polyfill both with a Map + a stub.
function installLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
}

/** A base64url JWT with the given payload (header/signature are throwaway). */
function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${b64({ alg: 'RS256' })}.${b64(payload)}.sig`
}

function session(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    accessToken: 'access-token',
    idToken: 'id-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 3_600_000,
    ...overrides,
  }
}

beforeEach(() => {
  installLocalStorage()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('session persistence', () => {
  it('round-trips a saved session', () => {
    const s = session()
    saveSession(s)
    expect(loadSession()).toEqual(s)
  })

  it('returns null when nothing is stored', () => {
    expect(loadSession()).toBeNull()
  })

  it('returns null for a malformed stored value', () => {
    localStorage.setItem('golftrax.auth.session', '{not json')
    expect(loadSession()).toBeNull()
  })

  it('clears the session', () => {
    saveSession(session())
    clearSession()
    expect(loadSession()).toBeNull()
  })
})

describe('decodeJwt', () => {
  it('decodes a payload without verifying', () => {
    expect(decodeJwt(jwt({ sub: 'auth0|42', email: 'a@b.com' }))).toMatchObject({
      sub: 'auth0|42',
      email: 'a@b.com',
    })
  })

  it('returns {} for a malformed token', () => {
    expect(decodeJwt('nonsense')).toEqual({})
    expect(decodeJwt('')).toEqual({})
  })
})

describe('startEmailCode', () => {
  it('POSTs a code-send request to the passwordless endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await startEmailCode(CONFIG, 'golfer@example.com')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.example.com/passwordless/start',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({ connection: 'email', send: 'code', email: 'golfer@example.com' })
  })

  it('throws a friendly AuthError on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'bad.email' }), { status: 400 }),
      ),
    )
    await expect(startEmailCode(CONFIG, 'nope')).rejects.toMatchObject({
      status: 400,
      detail: 'bad.email',
    })
  })
})

describe('verifyEmailCode', () => {
  it('exchanges the code for tokens and persists the session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: 'AT',
            id_token: 'IT',
            refresh_token: 'RT',
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      ),
    )

    const result = await verifyEmailCode(CONFIG, 'g@x.com', '123456')

    expect(result).toMatchObject({ accessToken: 'AT', idToken: 'IT', refreshToken: 'RT' })
    expect(result.expiresAt).toBeGreaterThan(Date.now())
    expect(loadSession()).toEqual(result)
  })

  it('throws on a bad code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 403 }),
      ),
    )
    await expect(verifyEmailCode(CONFIG, 'g@x.com', '000000')).rejects.toMatchObject({
      status: 403,
    })
  })
})

describe('getValidAccessToken', () => {
  it('returns null for no session', async () => {
    expect(await getValidAccessToken(CONFIG, null)).toEqual({ token: null, session: null })
  })

  it('returns the cached token when it is still fresh', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const s = session()

    const { token } = await getValidAccessToken(CONFIG, s)

    expect(token).toBe('access-token')
    expect(fetchMock).not.toHaveBeenCalled() // no refresh needed
  })

  it('refreshes an expired token and persists the renewed session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: 'AT2', id_token: 'IT2', expires_in: 3600 }),
          { status: 200 },
        ),
      ),
    )
    const expired = session({ expiresAt: Date.now() - 1000 })

    const { token, session: next } = await getValidAccessToken(CONFIG, expired)

    expect(token).toBe('AT2')
    expect(next?.accessToken).toBe('AT2')
    expect(next?.refreshToken).toBe('refresh-token') // carried over when omitted
    expect(loadSession()?.accessToken).toBe('AT2')
  })

  it('keeps the session but pauses when refresh fails on the network (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const expired = session({ expiresAt: Date.now() - 1000 })
    saveSession(expired)

    const { token, session: next } = await getValidAccessToken(CONFIG, expired)

    expect(token).toBeNull()
    expect(next).toEqual(expired) // session preserved for a later retry
  })

  it('clears the session when the refresh token is rejected (4xx)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 403 }),
      ),
    )
    const expired = session({ expiresAt: Date.now() - 1000 })
    saveSession(expired)

    const { token, session: next } = await getValidAccessToken(CONFIG, expired)

    expect(token).toBeNull()
    expect(next).toBeNull()
    expect(loadSession()).toBeNull() // permanently dropped
  })

  it('cannot refresh without a refresh token', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const expired = session({ expiresAt: Date.now() - 1000, refreshToken: null })

    const { token } = await getValidAccessToken(CONFIG, expired)

    expect(token).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
