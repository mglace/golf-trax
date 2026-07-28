'use strict'

const { app } = require('@azure/functions')
const { json } = require('../shared')
const { requireAuth } = require('../auth')
const { profileContainer, CosmosConfigError } = require('../cosmos')

/**
 * GET/PUT /api/profile — the authenticated user's server-side profile
 * (PHASE2.md §5.1, §11.6). This is the Phase 2 slice-2a end-to-end auth check:
 * a successful round-trip exercises token issuance → JWKS validation → a
 * per-user Cosmos read/write, before any round-sync logic exists.
 *
 * The profile document is `{ id: userId, userId, name, updatedAt, version,
 * serverUpdatedAt }`. `userId`, `version`, and `serverUpdatedAt` are
 * server-owned; anything a client sends for them is ignored and re-stamped.
 * Reconciliation is the same server-authoritative LWW as rounds — the server
 * bumps a monotonic `version` on every accepted write.
 */

/** Shape returned to the client (server-owned bookkeeping stays server-side-ish
 * but is echoed so the client can drive its own LWW). */
function toClientProfile(doc) {
  if (!doc) return null
  return {
    id: 'profile',
    name: typeof doc.name === 'string' ? doc.name : undefined,
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : undefined,
    version: doc.version,
    serverUpdatedAt: doc.serverUpdatedAt,
  }
}

async function readProfile(userId) {
  try {
    const { resource } = await profileContainer().item(userId, userId).read()
    return resource || null
  } catch (err) {
    if (err.code === 404) return null
    throw err
  }
}

const handler = requireAuth(async (request, context, { userId }) => {
  try {
    if (request.method === 'GET') {
      const doc = await readProfile(userId)
      return json(200, { profile: toClientProfile(doc) })
    }

    // PUT — upsert the display name under server-authoritative LWW.
    let body
    try {
      body = await request.json()
    } catch {
      return json(400, { error: 'Request body must be JSON.' })
    }
    // Only `name` is a client-owned field; cap its length defensively.
    const name =
      body && typeof body.name === 'string' ? body.name.slice(0, 200) : undefined
    // The client's wall-clock "last edited" is display/intent only.
    const updatedAt =
      body && typeof body.updatedAt === 'string' ? body.updatedAt : new Date().toISOString()

    const existing = await readProfile(userId)
    const nextVersion = (existing && Number.isFinite(existing.version) ? existing.version : 0) + 1
    const doc = {
      id: userId,
      userId,
      name,
      updatedAt,
      version: nextVersion,
      serverUpdatedAt: new Date().toISOString(),
    }
    const { resource } = await profileContainer().items.upsert(doc)
    return json(200, { profile: toClientProfile(resource || doc) })
  } catch (err) {
    if (err instanceof CosmosConfigError) {
      context.error(err.message)
      return json(500, { error: 'Sync storage is not configured on the server.' })
    }
    context.error('Profile request failed', err)
    return json(500, { error: 'Could not read or write the profile.' })
  }
})

app.http('profile', {
  methods: ['GET', 'PUT'],
  // Anonymous at the SWA layer; the JWT is enforced by requireAuth, keeping the
  // backend issuer-agnostic rather than tied to SWA EasyAuth (PHASE2.md §1.4).
  authLevel: 'anonymous',
  route: 'profile',
  handler,
})

module.exports = { toClientProfile }
