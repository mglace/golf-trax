'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { publicOrigin, shareIdFromPath, clientIp } = require('../src/share-request')

/**
 * These cases are transcribed from a real preview-environment response, not
 * guessed. Behind Static Web Apps a managed function sees an internal
 * azurewebsites.net URL, the routed path only in `x-ms-original-url`, and an
 * `x-forwarded-for` with multiple hops that each carry a port.
 */

function req(url, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return { url, headers: { get: (name) => lower[name.toLowerCase()] ?? null } }
}

const INTERNAL = 'https://a2ae44e2-6a8b-4190-a29a-0b0a61867080.azurewebsites.net/api/share-page'
const PUBLIC = 'https://yellow-pebble-012c7380f-29.eastus2.7.azurestaticapps.net'

test('publicOrigin uses the visitor-facing host, never the internal one', () => {
  // Building links from request.url would hand out azurewebsites.net URLs.
  const origin = publicOrigin(req(INTERNAL, { 'x-ms-original-url': `${PUBLIC}/r/abc123` }))
  assert.equal(origin, PUBLIC)
  assert.ok(!origin.includes('azurewebsites.net'))
})

test('publicOrigin falls back to the forwarded host', () => {
  assert.equal(
    publicOrigin(req(INTERNAL, { 'x-forwarded-host': 'golftrax.app' })),
    'https://golftrax.app',
  )
})

test('publicOrigin never returns the internal host even with no headers', () => {
  assert.ok(!publicOrigin(req(INTERNAL)).includes('azurewebsites.net'))
})

test('shareIdFromPath recovers the id the rewrite erased', () => {
  const request = req(`${INTERNAL}?diag=1`, { 'x-ms-original-url': `${PUBLIC}/r/abc123XYZ?diag=1` })
  assert.equal(shareIdFromPath(request), 'abc123XYZ')
})

test('shareIdFromPath reads a direct /r/ request when nothing rewrote', () => {
  assert.equal(shareIdFromPath(req(`${PUBLIC}/r/direct_id-1`)), 'direct_id-1')
})

test('shareIdFromPath accepts the /api/r fallback URL shape', () => {
  assert.equal(shareIdFromPath(req(`${PUBLIC}/api/r/fallback1`)), 'fallback1')
})

test('shareIdFromPath rejects paths that are not a share', () => {
  assert.equal(shareIdFromPath(req(`${PUBLIC}/r/`)), null)
  assert.equal(shareIdFromPath(req(`${PUBLIC}/rounds`)), null)
  // Path traversal must not survive the regex.
  assert.equal(shareIdFromPath(req(`${PUBLIC}/r/..%2f..%2fetc`)), null)
})

test('clientIp takes the first hop and strips the port', () => {
  // Real header from the preview environment. Without stripping the port every
  // request looks like a different client and rate limiting silently does
  // nothing.
  const request = req(INTERNAL, { 'x-forwarded-for': '204.111.129.146:35411, 40.70.146.140:23559' })
  assert.equal(clientIp(request), '204.111.129.146')
})

test('clientIp handles a bare address with no port', () => {
  assert.equal(clientIp(req(INTERNAL, { 'x-forwarded-for': '203.0.113.7' })), '203.0.113.7')
})

test('clientIp keeps IPv6 intact rather than truncating it', () => {
  assert.equal(
    clientIp(req(INTERNAL, { 'x-forwarded-for': '2001:db8::1' })),
    '2001:db8::1',
  )
  assert.equal(clientIp(req(INTERNAL, { 'x-forwarded-for': '[2001:db8::1]:443' })), '2001:db8::1')
})

test('clientIp returns null when no forwarding header is present', () => {
  // The caller treats this as "unmetered" rather than blocking every request.
  assert.equal(clientIp(req(INTERNAL)), null)
})
