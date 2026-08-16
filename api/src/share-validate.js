'use strict'

/**
 * Validation for the ANONYMOUS `POST /api/share` endpoint.
 *
 * This is the only unauthenticated write in the app, and whatever it accepts is
 * drawn onto an image served from our own domain — so it builds a clean record
 * from an allowlist rather than spreading the body, exactly like
 * `validate.js:validateRound` does for sync. Anything unrecognized is dropped,
 * not persisted.
 *
 * The payload is numbers plus three short strings. It is never image bytes:
 * accepting those would turn the endpoint into open image hosting.
 */

const MAX_COURSE = 120
const MAX_SHORT = 60
/** Generous enough for any real score, tight enough to bound the rendered text. */
const MAX_SCORE = 20
const MIN_PAR = 3
const MAX_PAR = 6
const MAX_BADGE = 80

/** C0 controls plus DEL. Written as escapes so no literal control byte lives in source. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g

function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Collapse whitespace and strip control characters from user-supplied text.
 *
 * Course names are user-typed for manually-entered courses, so this reaches the
 * renderer unvetted. Control characters and newlines would corrupt the SVG
 * layout even though the renderer escapes markup.
 */
function cleanText(v, max) {
  if (typeof v !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const stripped = v.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()
  if (stripped === '') return null
  return stripped.slice(0, max)
}

function isIntInRange(v, lo, hi) {
  return Number.isInteger(v) && v >= lo && v <= hi
}

/** A {hit, opp} stat pair, or null when absent/invalid. Hits cannot exceed opportunities. */
function cleanRatio(v, maxOpp) {
  if (v === undefined || v === null) return null
  if (!isObject(v)) return null
  const { hit, opp } = v
  if (!isIntInRange(opp, 1, maxOpp)) return null
  if (!isIntInRange(hit, 0, opp)) return null
  return { hit, opp }
}

/**
 * Validate a share snapshot. Returns the clean record or `{ error }`.
 *
 * Errors are returned rather than thrown so the caller can put the reason in a
 * 400 body — a silent rejection here is very hard to debug from the client.
 */
function validateSnapshot(body) {
  if (!isObject(body)) return { error: 'Body must be a JSON object.' }

  const course = cleanText(body.course, MAX_COURSE)
  if (!course) return { error: 'course is required.' }

  const tee = cleanText(body.tee, MAX_SHORT)
  if (!tee) return { error: 'tee is required.' }

  const { pars, scores, holeNumbers } = body
  if (!Array.isArray(pars) || !Array.isArray(scores)) {
    return { error: 'pars and scores must be arrays.' }
  }
  // Only whole rounds are shareable, so the length is one of exactly two values.
  if (pars.length !== 9 && pars.length !== 18) {
    return { error: 'A round must have 9 or 18 holes.' }
  }
  if (scores.length !== pars.length) {
    return { error: 'pars and scores must be the same length.' }
  }
  if (!pars.every((p) => isIntInRange(p, MIN_PAR, MAX_PAR))) {
    return { error: `Each par must be an integer ${MIN_PAR}-${MAX_PAR}.` }
  }
  if (!scores.every((s) => isIntInRange(s, 1, MAX_SCORE))) {
    return { error: `Each score must be an integer 1-${MAX_SCORE}.` }
  }

  let holes
  if (holeNumbers === undefined) {
    holes = pars.map((_, i) => i + 1)
  } else if (
    Array.isArray(holeNumbers) &&
    holeNumbers.length === pars.length &&
    holeNumbers.every((h) => isIntInRange(h, 1, 18))
  ) {
    holes = holeNumbers
  } else {
    return { error: 'holeNumbers must match the round length, each 1-18.' }
  }

  const date = typeof body.date === 'string' ? new Date(body.date) : null
  if (!date || Number.isNaN(date.getTime())) {
    return { error: 'date must be an ISO timestamp.' }
  }

  const snapshot = {
    course,
    tee,
    date: date.toISOString(),
    pars,
    scores,
    holeNumbers: holes,
  }

  const place = cleanText(body.place, MAX_SHORT)
  if (place) snapshot.place = place

  const fairways = cleanRatio(body.fairways, pars.length)
  if (fairways) snapshot.fairways = fairways

  const gir = cleanRatio(body.gir, pars.length)
  if (gir) snapshot.gir = gir

  if (isObject(body.putts)) {
    const total = body.putts.total
    // Averages are re-derived rather than trusted, so a client cannot print
    // arbitrary text into the putts tile.
    if (isIntInRange(total, 0, pars.length * 10)) {
      snapshot.putts = { total, avg: (total / pars.length).toFixed(1) }
    }
  }

  const badgeText = cleanText(body.badgeText, MAX_BADGE)
  if (badgeText) snapshot.badgeText = badgeText

  return { snapshot }
}

module.exports = { validateSnapshot, cleanText }
