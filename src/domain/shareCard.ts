/**
 * Pure logic for the shareable post-round card.
 *
 * Two jobs, deliberately in one place:
 *
 *  - `buildShareCard` produces the numeric snapshot the card is drawn from.
 *    This is the ONLY thing sent to the server — never image bytes, and never
 *    anything identifying. The server draws the card from these numbers.
 *  - `shareHighlight` decides whether a round is worth bragging about. The same
 *    signal drives two things: the badge printed on the card, and whether the
 *    app actively prompts to share or just leaves a quiet button. Prompting
 *    after every round trains people to dismiss it, and asks them to broadcast
 *    rounds they aren't proud of.
 *
 * No Dexie, no network, no React — this is the unit-tested correctness core,
 * and `api/src/share-card.js` is its JS port (see that file's parity note).
 */
import type { Round } from '@/db/types'
import { computeTotals, computeRoundStats, ROUND_LENGTH_LABEL } from './round'
import { scoreTone } from './scorecard'
import { roundScore, handicapEstimate } from './stats'

export type HighlightKind = 'personal-best' | 'beat-average' | 'milestone'

export interface Highlight {
  kind: HighlightKind
  /** Short second-person line for the card badge, e.g. "Your best round yet". */
  text: string
}

export interface ShareCardSnapshot {
  course: string
  place?: string
  tee: string
  /** ISO date; the server formats it for display so we don't trust a client string. */
  date: string
  pars: number[]
  scores: number[]
  /** Absolute hole numbers — a back-9 round is holes 10-18, not 1-9. */
  holeNumbers: number[]
  fairways?: { hit: number; opp: number }
  gir?: { hit: number; opp: number }
  putts?: { total: number; avg: string }
  badgeText?: string
}

/**
 * Only fully-scored rounds can be shared. A part-entered round would either
 * misrepresent the score or need caveats the card has no room for, and the
 * stats module already refuses to extrapolate one (`isScoreable`).
 */
export function isShareable(round: Round): boolean {
  return round.status === 'complete' && computeTotals(round.holes).isComplete
}

/**
 * Why this round is worth posting, or null if it isn't especially.
 *
 * `history` should be the user's completed rounds, newest-first, INCLUDING
 * `round` itself — that matches what `getCompletedRounds()` returns, so callers
 * don't have to do any filtering dance.
 *
 * Order matters: a personal best is a better brag than beating your average,
 * and both beat a scoring milestone.
 */
export function shareHighlight(round: Round, history: Round[]): Highlight | null {
  const current = roundScore(round)
  if (current === null || !isShareable(round)) return null

  const others = history.filter((r) => r.id !== round.id && computeTotals(r.holes).isComplete)

  // First completed round ever — there's no baseline to beat, so the milestone
  // IS that they finished one. Without this, a new user's very first card is
  // the one round guaranteed to have no badge.
  if (others.length === 0) {
    return { kind: 'milestone', text: 'First round tracked' }
  }

  const bestOther = others
    .map(roundScore)
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .reduce<number | null>((best, s) => (best === null || s.vsPar18 < best ? s.vsPar18 : best), null)

  if (bestOther !== null && current.vsPar18 < bestOther) {
    return { kind: 'personal-best', text: 'Your best round yet' }
  }

  // Compare against the rolling average of the PREVIOUS rounds, not one that
  // includes this round — otherwise a good round drags the average toward
  // itself and undersells the improvement.
  const baseline = handicapEstimate(others)
  if (baseline !== null) {
    const better = baseline.value - current.vsPar18
    if (better >= 1) {
      const strokes = Math.round(better)
      return {
        kind: 'beat-average',
        text: `${strokes} better than your ${baseline.sampleSize}-round average`,
      }
    }
  }

  let birdieOrBetter = 0
  let eagles = 0
  for (const h of round.holes) {
    const tone = scoreTone(h.score, h.par)
    if (tone === 'eagle') eagles += 1
    if (tone === 'eagle' || tone === 'birdie') birdieOrBetter += 1
  }
  if (eagles > 0) {
    return { kind: 'milestone', text: eagles === 1 ? 'Made an eagle' : `${eagles} eagles` }
  }
  if (birdieOrBetter >= 2) {
    return { kind: 'milestone', text: `${birdieOrBetter} birdies` }
  }

  return null
}

/**
 * The snapshot the card is rendered from.
 *
 * Stats are omitted entirely rather than sent as nulls when they weren't
 * tracked — the card drops those tiles instead of printing a row of dashes.
 * Note GIR only exists when putts were entered (it's derived from them), so
 * "no putts" legitimately means "no GIR" too.
 */
export function buildShareCard(round: Round, history: Round[]): ShareCardSnapshot {
  const stats = computeRoundStats(round.holes)
  const highlight = shareHighlight(round, history)

  const snapshot: ShareCardSnapshot = {
    course: round.courseName,
    tee: `${round.teeName} tees`,
    date: round.date,
    pars: round.holes.map((h) => h.par),
    scores: round.holes.map((h) => h.score ?? 0),
    holeNumbers: round.holes.map((h) => h.holeNumber),
  }

  if (round.clubName && round.clubName !== round.courseName) snapshot.place = round.clubName
  if (stats.fairwayOpportunities > 0) {
    snapshot.fairways = { hit: stats.fairwaysHit, opp: stats.fairwayOpportunities }
  }
  if (stats.girKnown > 0) snapshot.gir = { hit: stats.girHit, opp: stats.girKnown }
  if (stats.puttsKnown > 0) {
    snapshot.putts = {
      total: stats.totalPutts,
      avg: (stats.totalPutts / stats.puttsKnown).toFixed(1),
    }
  }
  if (highlight) snapshot.badgeText = highlight.text

  return snapshot
}

/** Human summary for the share sheet and the link's OG title. */
export function shareTitle(round: Round): string {
  const totals = computeTotals(round.holes)
  const vsPar = totals.vsPar === 0 ? 'even' : totals.vsPar > 0 ? `+${totals.vsPar}` : `${totals.vsPar}`
  return `${totals.totalScore} at ${round.courseName} · ${vsPar}`
}

/** Label used in analytics only — never sent to the server. */
export function roundLengthLabel(round: Round): string {
  return ROUND_LENGTH_LABEL[round.roundLength]
}
