'use strict'

/**
 * Cosmos access for public share cards.
 *
 * A third container alongside `rounds` and `profile`, but a different shape:
 * shares are ANONYMOUS, so documents are partitioned by their own id and carry
 * **no user id at all**. A share must not be linkable back to an account — the
 * whole point is that a signed-out user can share, and the record should not
 * quietly become a profile of who played where.
 */

const crypto = require('node:crypto')
const { CosmosClient } = require('@azure/cosmos')

let client
let database

class CosmosConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CosmosConfigError'
  }
}

function getDatabase() {
  if (!database) {
    const endpoint = process.env.COSMOS_ENDPOINT
    const key = process.env.COSMOS_KEY
    const databaseId = process.env.COSMOS_DATABASE || 'golftrax'
    if (!endpoint || !key) {
      throw new CosmosConfigError('COSMOS_ENDPOINT / COSMOS_KEY app settings are not configured')
    }
    client = client || new CosmosClient({ endpoint, key })
    database = client.database(databaseId)
  }
  return database
}

/** The `shares` container (partition key `/id`; point reads are the only access pattern). */
function sharesContainer() {
  return getDatabase().container('shares')
}

/** Per-IP rate-limit counters. Same container, `type: 'rate'` documents, TTL-expired. */
function rateContainer() {
  return getDatabase().container('shares')
}

/**
 * 16 random bytes, base64url — ~22 chars, 128 bits.
 *
 * Deliberately NOT the round id: that is a sync key, and reusing it would leak
 * one identifier into a public URL and make shares enumerable from any round id
 * that ever escaped.
 */
function newShareId() {
  return crypto.randomBytes(16).toString('base64url')
}

/** A revoke capability. Only its hash is stored, so a DB read cannot revoke anything. */
function newRevokeToken() {
  return crypto.randomBytes(24).toString('base64url')
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** IPs are hashed before storage — rate limiting needs identity, not the address. */
function hashIp(ip) {
  const salt = process.env.SHARE_IP_SALT || 'golftrax-share'
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32)
}

const RATE_LIMIT_PER_HOUR = Number(process.env.SHARE_RATE_LIMIT || 20)

/**
 * Consume one unit of an IP's hourly quota.
 *
 * Returns `{ allowed, count }`. **Fails OPEN** on any storage error: a Cosmos
 * blip should degrade to "unmetered" rather than block every user from sharing.
 * The counter is a plain read-modify-write and can undercount under concurrency
 * from one IP — acceptable, because this exists to stop bulk abuse, not to be
 * an exact quota.
 */
async function consumeRateLimit(ip, context) {
  if (!ip) return { allowed: true, count: 0 }

  const hour = new Date().toISOString().slice(0, 13) // yyyy-mm-ddThh
  const id = `rate:${hashIp(ip)}:${hour}`

  try {
    const container = rateContainer()
    let count = 0
    try {
      const { resource } = await container.item(id, id).read()
      count = resource?.count ?? 0
    } catch (err) {
      if (err.code !== 404) throw err
    }

    if (count >= RATE_LIMIT_PER_HOUR) return { allowed: false, count }

    await container.items.upsert({
      id,
      type: 'rate',
      count: count + 1,
      // Expire two hours out so counters clean themselves up; the container
      // needs defaultTtl enabled (-1) for this to take effect.
      ttl: 7200,
    })
    return { allowed: true, count: count + 1 }
  } catch (err) {
    context.warn('Share rate limiting unavailable, allowing request', err)
    return { allowed: true, count: 0 }
  }
}

/**
 * Persist a share. Returns the stored document.
 *
 * `origin` is recorded because SWA staging environments inherit the production
 * app settings: a share created while testing a PR preview lands in this same
 * container, with a link pointing at a host that dies when the PR closes.
 * Stamping it keeps those records identifiable and purgeable instead of
 * indistinguishable from real user shares.
 */
async function createShare(snapshot, revokeToken, origin) {
  const id = newShareId()
  const doc = {
    id,
    type: 'share',
    snapshot,
    createdAt: new Date().toISOString(),
    revokeHash: hashToken(revokeToken),
  }
  if (origin) doc.origin = origin
  await sharesContainer().items.create(doc)
  return doc
}

/** Point-read a share, or null when missing/revoked. */
async function getShare(shareId) {
  try {
    const { resource } = await sharesContainer().item(shareId, shareId).read()
    if (!resource || resource.type !== 'share') return null
    return resource
  } catch (err) {
    if (err.code === 404) return null
    throw err
  }
}

/** Delete a share if the caller holds the revoke capability. */
async function revokeShare(shareId, revokeToken) {
  const existing = await getShare(shareId)
  if (!existing) return { ok: false, reason: 'not-found' }

  const provided = hashToken(String(revokeToken || ''))
  const expected = String(existing.revokeHash || '')
  // Constant-time compare; lengths must match first or timingSafeEqual throws.
  const match =
    provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  if (!match) return { ok: false, reason: 'forbidden' }

  await sharesContainer().item(shareId, shareId).delete()
  return { ok: true }
}

module.exports = {
  sharesContainer,
  createShare,
  getShare,
  revokeShare,
  consumeRateLimit,
  newShareId,
  newRevokeToken,
  hashToken,
  hashIp,
  CosmosConfigError,
  RATE_LIMIT_PER_HOUR,
}
