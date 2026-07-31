'use strict'

/**
 * Tests for the server-side round validator. Focus: courseId is an opaque
 * STRING and a legacy finite number is coerced (not rejected). A rejected push
 * gets quarantined client-side, so accepting valid rounds here matters — see
 * the client port in src/domain/backup.ts. Run with `npm test` in api/.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const { validateRound } = require('../src/validate')

function round(overrides) {
  return {
    id: 'r1',
    courseId: 'yasc0cpx',
    courseName: 'Lubbock CC',
    clubName: 'Lubbock CC',
    gender: 'male',
    teeName: 'Blue',
    roundLength: '18',
    status: 'complete',
    date: '2026-07-01T12:00:00.000Z',
    holes: [{ holeNumber: 1, par: 4, handicap: 5, yardage: 400, score: 5 }],
    ...overrides,
  }
}

test('accepts an opaque string courseId', () => {
  const clean = validateRound(round())
  assert.equal(clean.courseId, 'yasc0cpx')
})

test('coerces a legacy numeric courseId to a string instead of rejecting', () => {
  const clean = validateRound(round({ courseId: -1 }))
  assert.notEqual(clean, null)
  assert.equal(clean.courseId, '-1')
})

test('rejects an empty or non-string/non-number courseId', () => {
  assert.equal(validateRound(round({ courseId: '' })), null)
  assert.equal(validateRound(round({ courseId: null })), null)
  assert.equal(validateRound(round({ courseId: {} })), null)
})
