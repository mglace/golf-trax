'use strict'

/**
 * POST   /api/share            create a public share card (ANONYMOUS)
 * DELETE /api/share/{shareId}  revoke one, given its revoke token
 *
 * Anonymous by design: most users never sign in, and gating sharing behind an
 * account would remove most of the funnel this feature exists to create. That
 * makes this the app's only unauthenticated write, so it is validated against
 * an allowlist (share-validate.js) and rate limited per IP (share-store.js).
 */

const { app } = require('@azure/functions')
const { json } = require('../shared')
const { validateSnapshot } = require('../share-validate')
const { createShare, revokeShare, consumeRateLimit, newRevokeToken } = require('../share-store')
const { publicOrigin, clientIp } = require('../share-request')

app.http('share-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'share',
  handler: async (request, context) => {
    let body
    try {
      body = await request.json()
    } catch {
      return json(400, { error: 'Body must be valid JSON.' })
    }

    const { snapshot, error } = validateSnapshot(body)
    if (error) return json(400, { error })

    // Rate limit AFTER validation so malformed requests are cheap to reject and
    // don't consume a legitimate user's quota.
    const ip = clientIp(request)
    const { allowed } = await consumeRateLimit(ip, context)
    if (!allowed) {
      return json(429, { error: 'Too many shares from this network. Try again later.' })
    }

    const revokeToken = newRevokeToken()
    let doc
    try {
      doc = await createShare(snapshot, revokeToken)
    } catch (err) {
      context.error('Failed to persist share', err)
      return json(500, { error: 'Could not create the share link.' })
    }

    const origin = publicOrigin(request)
    return json(201, {
      shareId: doc.id,
      url: `${origin}/r/${doc.id}`,
      imageUrl: `${origin}/api/share/${doc.id}/image.png`,
      // The only time this is ever returned. It is the sole way to revoke a
      // share later, since there is no account to authorize a delete against.
      revokeToken,
    })
  },
})

app.http('share-revoke', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'share/{shareId}',
  handler: async (request, context) => {
    const shareId = request.params.shareId
    if (!shareId || !/^[A-Za-z0-9_-]+$/.test(shareId)) {
      return json(400, { error: 'Invalid share id.' })
    }

    const token = request.headers.get('x-golftrax-revoke-token')
    if (!token) return json(401, { error: 'Missing revoke token.' })

    let result
    try {
      result = await revokeShare(shareId, token)
    } catch (err) {
      context.error('Failed to revoke share', err)
      return json(500, { error: 'Could not revoke the share link.' })
    }

    // A wrong token and a missing share both report 404: distinguishing them
    // would confirm which ids exist to anyone probing.
    if (!result.ok) return json(404, { error: 'Share not found.' })
    return json(200, { revoked: true })
  },
})
