'use strict'

/**
 * Parity tests for the server reconciliation port (src/sync-core.js). These
 * mirror the authoritative client spec in src/domain/sync.test.ts so the JS
 * port can't silently drift from the TS source of truth. Run with `npm test`
 * in api/ (Node's built-in runner; no dependency). Not deployed (funcignored).
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  decidePush,
  isCursorStale,
  tombstoneTtlSeconds,
  versionOf,
  TOMBSTONE_TTL_DAYS,
} = require('../src/sync-core')

test('versionOf treats missing/NaN as 0', () => {
  assert.equal(versionOf(undefined), 0)
  assert.equal(versionOf({}), 0)
  assert.equal(versionOf({ version: 3 }), 3)
})

test('decidePush: new id accepted as version 1', () => {
  assert.deepEqual(decidePush({ version: 0 }, null), { accepted: true, version: 1, deleted: false })
})

test('decidePush: edit accepted iff base matches stored version', () => {
  assert.deepEqual(decidePush({ version: 5 }, { version: 5 }), {
    accepted: true,
    version: 6,
    deleted: false,
  })
  assert.deepEqual(decidePush({ version: 5 }, { version: 6 }), {
    accepted: false,
    version: 6,
    deleted: false,
  })
})

test('decidePush: delete wins over same/older edit, never resurrected', () => {
  assert.deepEqual(decidePush({ version: 5, deletedAt: 't' }, { version: 5 }), {
    accepted: true,
    version: 6,
    deleted: true,
  })
  assert.deepEqual(decidePush({ version: 4, deletedAt: 't' }, { version: 6 }), {
    accepted: true,
    version: 7,
    deleted: true,
  })
  // An edit cannot resurrect a tombstone.
  assert.deepEqual(decidePush({ version: 5 }, { version: 6, deletedAt: 't' }), {
    accepted: false,
    version: 6,
    deleted: true,
  })
})

test('decidePush: re-delete is an idempotent no-op (no version bump)', () => {
  assert.deepEqual(decidePush({ version: 6, deletedAt: 't' }, { version: 6, deletedAt: 't' }), {
    accepted: true,
    version: 6,
    deleted: true,
  })
})

test('isCursorStale: TTL boundary', () => {
  const now = Date.parse('2026-07-28T00:00:00.000Z')
  assert.equal(isCursorStale(now - (TOMBSTONE_TTL_DAYS - 1) * 86_400_000, now), false)
  assert.equal(isCursorStale(now - (TOMBSTONE_TTL_DAYS + 1) * 86_400_000, now), true)
  assert.equal(isCursorStale(0, now), false)
})

test('tombstoneTtlSeconds: ~90d fresh, floored at 1s when old', () => {
  const now = Date.parse('2026-07-28T00:00:00.000Z')
  assert.equal(tombstoneTtlSeconds('2026-07-28T00:00:00.000Z', now), TOMBSTONE_TTL_DAYS * 86_400)
  assert.equal(tombstoneTtlSeconds('2026-01-01T00:00:00.000Z', now), 1)
})
