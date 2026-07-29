'use strict'

/**
 * Server-side validation of untrusted round JSON pushed to /api/sync/push
 * (PHASE2.md §6.2, §11.7). This is the backend equivalent of the client's
 * `src/domain/backup.ts:validateRound`, hardened for a server that now ingests
 * untrusted input: it builds a clean record from an allowlist of known fields
 * (rather than spreading the body) so nothing unexpected — and nothing
 * server-owned — is ever persisted from the request body.
 *
 * Server-owned fields (userId, version, serverUpdatedAt, serverTs, _ts, ttl) and
 * client-local fields (dirty, owner) are deliberately NOT copied here; the push
 * handler stamps userId/version/serverUpdatedAt itself.
 */

const ROUND_LENGTHS = ['front9', 'back9', '18']
const ROUND_STATUSES = ['draft', 'complete']

function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Sanitize one hole; the four snapshot fields are required finite numbers. */
function sanitizeHole(h) {
  if (!isObject(h)) return null
  const { holeNumber, par, handicap, yardage, score, fairwayHit, putts, gir } = h
  if (!Number.isFinite(holeNumber)) return null
  if (!Number.isFinite(par)) return null
  if (!Number.isFinite(handicap)) return null
  if (!Number.isFinite(yardage)) return null
  const clean = { holeNumber, par, handicap, yardage }
  if (Number.isFinite(score)) clean.score = score
  if (typeof fairwayHit === 'boolean') clean.fairwayHit = fairwayHit
  if (Number.isFinite(putts)) clean.putts = putts
  if (typeof gir === 'boolean') clean.gir = gir
  return clean
}

/**
 * Validate + sanitize a pushed round. Returns a clean content record (no
 * server-owned or client-local fields) or null if it is structurally invalid.
 * `deletedAt` is preserved when present (tombstones are pushed like any round).
 */
function validateRound(v) {
  if (!isObject(v)) return null
  const {
    id,
    courseId,
    courseName,
    clubName,
    gender,
    teeName,
    roundLength,
    status,
    date,
    holes,
    notes,
    totalScore,
    totalPar,
    updatedAt,
    deletedAt,
  } = v

  if (typeof id !== 'string' || id === '') return null
  if (typeof courseId !== 'number' || !Number.isFinite(courseId)) return null
  if (typeof courseName !== 'string') return null
  if (typeof clubName !== 'string') return null
  if (gender !== 'male' && gender !== 'female') return null
  if (typeof teeName !== 'string') return null
  if (!ROUND_LENGTHS.includes(roundLength)) return null
  if (!ROUND_STATUSES.includes(status)) return null
  if (typeof date !== 'string') return null
  if (!Array.isArray(holes)) return null

  const cleanHoles = []
  for (const h of holes) {
    const clean = sanitizeHole(h)
    if (!clean) return null // a single corrupt hole invalidates the round
    cleanHoles.push(clean)
  }

  const round = {
    id,
    courseId,
    courseName,
    clubName,
    gender,
    teeName,
    roundLength,
    status,
    date,
    holes: cleanHoles,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : date,
  }
  if (typeof notes === 'string') round.notes = notes
  if (Number.isFinite(totalScore)) round.totalScore = totalScore
  if (Number.isFinite(totalPar)) round.totalPar = totalPar
  if (typeof deletedAt === 'string') round.deletedAt = deletedAt
  return round
}

module.exports = { validateRound }
