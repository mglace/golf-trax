'use strict'

/**
 * JWT validation for the authenticated `/api/*` endpoints (Phase 2 sync).
 *
 * The backend is deliberately **auth-issuer-agnostic** (PHASE2.md §1.4): it
 * verifies a bearer JWT against the issuer's JWKS and reads a stable user id
 * from the `sub` claim. Nothing here depends on *which* issuer that is, so the
 * auth choice (Auth0 passwordless today) stays swappable.
 *
 * The user id ALWAYS comes from the verified token, never from the request body
 * (PHASE2.md §11.7).
 */

const { createRemoteJWKSet, jwtVerify } = require('jose')
const { json } = require('./shared')

/** Raised when the server is missing its auth app settings (a 500, not a 401). */
class AuthConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AuthConfigError'
  }
}

// A remote JWKS set caches keys and refreshes on rotation. Cache one resolver
// per issuer domain so repeated invocations reuse fetched keys (cold starts
// aside) instead of hitting the JWKS endpoint on every request.
let jwksResolver
let jwksDomain

function getJwks(domain) {
  if (!jwksResolver || jwksDomain !== domain) {
    jwksResolver = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`))
    jwksDomain = domain
  }
  return jwksResolver
}

/**
 * Verify a raw JWT and return its payload. Throws {@link AuthConfigError} if the
 * server isn't configured, or a jose verification error if the token is bad.
 */
async function verifyToken(token) {
  const domain = process.env.AUTH0_DOMAIN
  const audience = process.env.AUTH0_AUDIENCE
  if (!domain || !audience) {
    throw new AuthConfigError('AUTH0_DOMAIN / AUTH0_AUDIENCE app settings are not configured')
  }
  const { payload } = await jwtVerify(token, getJwks(domain), {
    issuer: `https://${domain}/`,
    audience,
    algorithms: ['RS256'],
  })
  return payload
}

/**
 * Wrap an Azure Functions handler so it only runs for a valid bearer token.
 * The wrapped handler is called as `(request, context, auth)` where `auth` is
 * `{ userId, claims }` and `userId` is the verified `sub`.
 *
 * Failures map to:
 *  - 401 — missing/malformed header, invalid/expired token, or no `sub`.
 *  - 500 — server auth misconfiguration (surfaced to logs, generic to caller).
 *
 * @param {(request: import('@azure/functions').HttpRequest, context: import('@azure/functions').InvocationContext, auth: { userId: string, claims: object }) => Promise<any>} handler
 */
function requireAuth(handler) {
  return async (request, context) => {
    const header = request.headers.get('authorization') || ''
    const match = /^Bearer (.+)$/i.exec(header.trim())
    if (!match) return json(401, { error: 'Missing bearer token.' })

    let payload
    try {
      payload = await verifyToken(match[1])
    } catch (err) {
      if (err instanceof AuthConfigError) {
        context.error(err.message)
        return json(500, { error: 'Authentication is not configured on the server.' })
      }
      // Don't leak token internals; a bad/expired token is a routine 401.
      context.warn(`JWT validation failed: ${err && (err.code || err.message)}`)
      return json(401, { error: 'Invalid or expired token.' })
    }

    const userId = payload.sub
    if (typeof userId !== 'string' || userId === '') {
      return json(401, { error: 'Token is missing a subject claim.' })
    }
    return handler(request, context, { userId, claims: payload })
  }
}

module.exports = { requireAuth, verifyToken, AuthConfigError }
