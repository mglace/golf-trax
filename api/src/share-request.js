'use strict'

/**
 * Request helpers for the public share endpoints.
 *
 * A managed function behind Static Web Apps does NOT see the request the way
 * the visitor made it. Verified against a live preview environment:
 *
 *   request.url          https://<guid>.azurewebsites.net/api/share-probe?diag=1
 *   x-ms-original-url    https://<site>.azurestaticapps.net/r/abc123XYZ?diag=1
 *   x-forwarded-for      204.111.129.146:35411, 40.70.146.140:23559
 *
 * Three consequences, each of which would be a bug if assumed away:
 *  - `request.url` is the INTERNAL hostname. Building a share link from it
 *    would hand out azurewebsites.net URLs nobody can meaningfully share.
 *  - After a `/r/*` rewrite the routed path is gone; the share id survives only
 *    in `x-ms-original-url`, which is a full absolute URL, not a bare path.
 *  - `x-forwarded-for` carries MULTIPLE hops and each one has a :port suffix,
 *    so naive parsing yields "1.2.3.4:35411" and every request looks unique —
 *    which would silently defeat rate limiting.
 */

/** The URL the visitor actually requested, or null when not behind a rewrite. */
function originalUrl(request) {
  const raw = request.headers.get('x-ms-original-url')
  if (!raw) return null
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

/**
 * Public origin to build share links against.
 *
 * Prefers the original URL, then the forwarded host, and finally an explicit
 * app setting. `request.url` is deliberately never used — see the header.
 */
function publicOrigin(request) {
  const original = originalUrl(request)
  if (original) return original.origin

  const host = request.headers.get('x-forwarded-host')
  if (host) return `https://${host}`

  const configured = process.env.PUBLIC_ORIGIN
  if (configured) return configured.replace(/\/+$/, '')

  return 'https://golftrax.app'
}

/**
 * The share id from a `/r/{shareId}` request, or null.
 *
 * Reads the rewritten-away path out of `x-ms-original-url`, falling back to the
 * request's own path for local dev where nothing rewrites.
 */
function shareIdFromPath(request) {
  const original = originalUrl(request)
  let pathname
  try {
    pathname = (original || new URL(request.url)).pathname
  } catch {
    return null
  }
  const match = /^\/(?:r|api\/r)\/([A-Za-z0-9_-]+)\/?$/.exec(pathname)
  return match ? match[1] : null
}

/**
 * Best-effort client IP for rate limiting.
 *
 * Takes the first hop (the closest thing to the real client) and strips the
 * port, without which every request from one client counts separately.
 * IPv6 addresses arrive bracketed, so only strip a trailing `:digits` when the
 * remainder still looks like an address rather than part of the IPv6 itself.
 */
function clientIp(request) {
  const raw =
    request.headers.get('x-forwarded-for') || request.headers.get('x-ms-forwarded-client-ip') || ''
  const first = raw.split(',')[0].trim()
  if (!first) return null

  // "[::1]:1234" → "::1"
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(first)
  if (bracketed) return bracketed[1]

  // "1.2.3.4:35411" → "1.2.3.4"; a bare IPv6 has more than one colon, leave it.
  const colons = (first.match(/:/g) || []).length
  if (colons === 1) return first.slice(0, first.lastIndexOf(':'))
  return first
}

module.exports = { originalUrl, publicOrigin, shareIdFromPath, clientIp }
