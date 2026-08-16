'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { isPreviewShare } = require('../src/share-purge')

/**
 * This predicate decides what gets deleted from the production container, so
 * the tests are weighted toward the expensive failure: destroying a real user's
 * share. Leaving a stray test document behind costs nothing.
 */

const PREVIEW = 'https://yellow-pebble-012c7380f-29.eastus2.7.azurestaticapps.net'
const PROD = 'https://golftrax.app'

const share = (over = {}) => ({ id: 's1', type: 'share', origin: PREVIEW, ...over })

test('identifies a share created from a preview environment', () => {
  assert.equal(isPreviewShare(share()), true)
})

test('never touches a production share', () => {
  assert.equal(isPreviewShare(share({ origin: PROD })), false)
  assert.equal(isPreviewShare(share({ origin: `${PROD}/` })), false)
  assert.equal(isPreviewShare(share({ origin: PROD.toUpperCase() })), false)
})

test('never touches a share with no recorded origin', () => {
  // Predates origin stamping: no evidence either way, and absence of evidence
  // must not mean deletion.
  assert.equal(isPreviewShare(share({ origin: undefined })), false)
  assert.equal(isPreviewShare(share({ origin: null })), false)
  assert.equal(isPreviewShare(share({ origin: '   ' })), false)
  assert.equal(isPreviewShare(share({ origin: 42 })), false)
})

test('never touches rate-limit counters or unknown documents', () => {
  // Counters expire via their own ttl; nothing should delete them by hand.
  assert.equal(isPreviewShare({ id: 'rate:abc:2026-08-16T01', type: 'rate', count: 3 }), false)
  assert.equal(isPreviewShare({ id: 'x' }), false)
  assert.equal(isPreviewShare(null), false)
  assert.equal(isPreviewShare(undefined), false)
})

test('refuses to act when given no production baseline', () => {
  // An empty list would otherwise make every share look non-production and
  // wipe the container.
  assert.equal(isPreviewShare(share({ origin: PROD }), []), false)
  assert.equal(isPreviewShare(share(), []), false)
})

test('honours extra production origins, e.g. a second custom domain', () => {
  const origins = [PROD, 'https://www.golftrax.app']
  assert.equal(isPreviewShare(share({ origin: 'https://www.golftrax.app' }), origins), false)
  assert.equal(isPreviewShare(share(), origins), true)
})
