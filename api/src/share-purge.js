'use strict'

/**
 * Which share documents were created from a non-production environment.
 *
 * SWA staging environments inherit the production app settings, so a share
 * created while testing a PR lands in the **production** container with a link
 * pointing at a host that dies when the PR closes. `createShare` stamps the
 * origin precisely so those stay identifiable.
 *
 * This is a pure predicate with its own tests because it decides what gets
 * deleted from production. The failure that matters is not "a test share
 * survived" — it is "a real user's share was destroyed", so every rule here is
 * written to fail in the safe direction.
 */

/** Origins that serve real users. Anything else is a test environment. */
const DEFAULT_PRODUCTION_ORIGINS = ['https://golftrax.app']

function normalizeOrigin(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\/+$/, '').toLowerCase()
  return trimmed === '' ? null : trimmed
}

/**
 * True only when the document is a share that is definitely NOT production.
 *
 * Deliberately conservative — it returns false unless it is certain:
 *  - Not a share document (rate-limit counters are left alone; they TTL out).
 *  - **No origin recorded.** These predate origin stamping, so there is no
 *    evidence either way, and "no evidence" must never mean "delete".
 *  - Origin matches a production origin, including a bare-host form.
 */
function isPreviewShare(doc, productionOrigins = DEFAULT_PRODUCTION_ORIGINS) {
  if (!doc || doc.type !== 'share') return false

  const origin = normalizeOrigin(doc.origin)
  if (origin === null) return false

  const production = productionOrigins.map(normalizeOrigin).filter((o) => o !== null)
  if (production.length === 0) return false // no baseline to compare against

  return !production.some((p) => origin === p || origin === p.replace(/^https?:\/\//, ''))
}

module.exports = { isPreviewShare, normalizeOrigin, DEFAULT_PRODUCTION_ORIGINS }
