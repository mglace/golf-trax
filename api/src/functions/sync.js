'use strict'

const { app } = require('@azure/functions')
const { json } = require('../shared')
const { requireAuth } = require('../auth')
const { roundsContainer, CosmosConfigError } = require('../cosmos')
const { validateRound } = require('../validate')
const {
  decidePush,
  isCursorStale,
  tombstoneTtlSeconds,
  versionOf,
  SYNC_PAGE_LIMIT,
} = require('../sync-core')

/**
 * Phase 2 sync endpoints (PHASE2.md §6.2). Both are JWT-protected; the user id
 * comes only from the verified token, and every server-owned field
 * (userId/version/serverUpdatedAt/serverTs/_ts) is stamped by the server, never
 * trusted from the body (§11.7).
 *
 *   POST /api/sync/push  { rounds: Round[] }        (<=100, §11.8)
 *   GET  /api/sync/pull?since=<serverTs ms>&sinceId=<id>&limit=<n<=100>
 */

/** Strip Cosmos/system + server-internal fields before returning a round. */
function toClientRound(doc) {
  const {
    // dropped: userId, serverTs (pagination key), ttl, and Cosmos-managed
    // _rid/_self/_etag/_attachments/_ts
    userId,
    serverTs,
    ttl,
    _rid,
    _self,
    _etag,
    _attachments,
    _ts,
    ...round
  } = doc
  return round
}

function mapCosmosError(err, context) {
  if (err instanceof CosmosConfigError) {
    context.error(err.message)
    return json(500, { error: 'Sync storage is not configured on the server.' })
  }
  context.error('Sync request failed', err)
  return json(500, { error: 'Sync failed.' })
}

// --- POST /api/sync/push -------------------------------------------------

const pushHandler = requireAuth(async (request, context, { userId }) => {
  let body
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'Request body must be JSON.' })
  }
  const rounds = body && Array.isArray(body.rounds) ? body.rounds : null
  if (!rounds) return json(400, { error: 'Body must be { rounds: [...] }.' })
  if (rounds.length > SYNC_PAGE_LIMIT) {
    return json(400, { error: `At most ${SYNC_PAGE_LIMIT} rounds per push; page larger sets.` })
  }

  const container = roundsContainer()
  const results = []
  try {
    for (const raw of rounds) {
      const clean = validateRound(raw)
      if (!clean) {
        // Structurally invalid — never stored; reported so the client can drop it.
        results.push({ id: raw && raw.id, accepted: false, invalid: true })
        continue
      }
      // Base version comes from the body (the CAS base); everything else
      // server-owned is ignored (§11.7).
      const base = Number.isFinite(raw.version) ? raw.version : 0

      let stored = null
      try {
        const read = await container.item(clean.id, userId).read()
        stored = read.resource || null
      } catch (err) {
        if (err.code !== 404) throw err
      }

      const decision = decidePush({ version: base, deletedAt: clean.deletedAt }, stored)
      if (!decision.accepted) {
        results.push({
          id: clean.id,
          accepted: false,
          version: decision.version,
          serverUpdatedAt: stored && stored.serverUpdatedAt,
        })
        continue
      }

      // An idempotent re-delete (version unchanged) is already stored — skip the
      // write so we don't churn serverTs and re-broadcast an unchanged tombstone.
      const isNoop = stored && decision.version === versionOf(stored)
      if (isNoop) {
        results.push({
          id: clean.id,
          accepted: true,
          version: stored.version,
          serverUpdatedAt: stored.serverUpdatedAt,
        })
        continue
      }

      // `serverTs` (epoch ms) is the pagination key: a server-owned, monotonic
      // field ordered on in `pull`. We deliberately do NOT paginate on the
      // Cosmos-native `_ts` because a composite index over a *system* path
      // (`/_ts`) is not reliably supported; a user-owned field sidesteps that
      // and gives ms resolution (vs `_ts`'s seconds). `serverUpdatedAt` is the
      // same instant as an ISO string for display.
      const serverTs = Date.now()
      const serverUpdatedAt = new Date(serverTs).toISOString()
      const doc = {
        ...clean,
        userId,
        version: decision.version,
        serverUpdatedAt,
        serverTs,
      }
      // Tombstones self-GC 90 days after deletedAt via a per-item ttl (§11.3);
      // live rounds carry no ttl so they never expire.
      if (decision.deleted && clean.deletedAt) {
        doc.ttl = tombstoneTtlSeconds(clean.deletedAt, Date.now())
      }

      // Make the version compare-and-set atomic. Without a precondition, the
      // read-then-write above is a TOCTOU: two devices reading the same stored
      // version both `decidePush → accept vN+1` and the second write clobbers
      // the first (silent lost update). Gate the write on the exact document we
      // read — IfMatch(_etag) for an update, create for a brand-new id — and
      // map a precondition/conflict failure to a rejection so the client pulls
      // the winning version and retries.
      try {
        if (stored) {
          await container
            .item(clean.id, userId)
            .replace(doc, { accessCondition: { type: 'IfMatch', condition: stored._etag } })
        } else {
          await container.items.create(doc)
        }
      } catch (err) {
        if (err.code === 412 || err.code === 409) {
          results.push({
            id: clean.id,
            accepted: false,
            version: versionOf(stored),
            serverUpdatedAt: stored && stored.serverUpdatedAt,
          })
          continue
        }
        throw err
      }
      results.push({ id: clean.id, accepted: true, version: decision.version, serverUpdatedAt })
    }
  } catch (err) {
    return mapCosmosError(err, context)
  }

  return json(200, { results })
})

// --- GET /api/sync/pull --------------------------------------------------

const pullHandler = requireAuth(async (request, context, { userId }) => {
  const since = Math.max(0, parseInt(request.query.get('since') || '0', 10) || 0)
  const sinceId = request.query.get('sinceId') || ''
  const limitParam = parseInt(request.query.get('limit') || '', 10)
  const limit = Number.isFinite(limitParam)
    ? Math.min(SYNC_PAGE_LIMIT, Math.max(1, limitParam))
    : SYNC_PAGE_LIMIT

  // A cursor older than the tombstone TTL can't trust a delta — tell the client
  // to full-resync from scratch (§11.3) rather than risk delete-resurrection.
  // `since` is epoch ms (the server-owned `serverTs`), so no unit conversion.
  if (isCursorStale(since, Date.now())) {
    return json(200, { resync: true, rounds: [], maxTs: 0, maxId: '', hasMore: false })
  }

  try {
    // Keyset pagination over a TOTAL order `(serverTs ASC, id ASC)`. Ordering on
    // a single timestamp isn't a total order (ties unordered), and OFFSET paging
    // over a non-total order can silently SKIP rows that share a timestamp across
    // separate page queries. A keyset — `(serverTs, id) > (since, sinceId)` — is
    // stable across requests and immune to that. The first page of a run passes
    // sinceId='' so the predicate reduces to `serverTs >= since`, preserving the
    // §11.9 boundary re-see (idempotent apply). `serverTs` is a user-owned field
    // (not the system `/_ts`) so its composite index is always permitted — see
    // docs/PHASE2-SETUP.md.
    const query = {
      query:
        'SELECT * FROM c WHERE c.serverTs > @since OR (c.serverTs = @since AND c.id > @sinceId) ' +
        'ORDER BY c.serverTs ASC, c.id ASC OFFSET 0 LIMIT @limit',
      parameters: [
        { name: '@since', value: since },
        { name: '@sinceId', value: sinceId },
        { name: '@limit', value: limit },
      ],
    }
    const { resources } = await roundsContainer()
      .items.query(query, { partitionKey: userId })
      .fetchAll()

    const rounds = resources.map(toClientRound)
    const last = resources[resources.length - 1]
    const maxTs = last ? last.serverTs : since
    const maxId = last ? last.id : sinceId
    const hasMore = resources.length === limit
    return json(200, { rounds, maxTs, maxId, hasMore })
  } catch (err) {
    return mapCosmosError(err, context)
  }
})

app.http('sync-push', {
  methods: ['POST'],
  authLevel: 'anonymous', // JWT enforced by requireAuth (§1.4)
  route: 'sync/push',
  handler: pushHandler,
})

app.http('sync-pull', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sync/pull',
  handler: pullHandler,
})
