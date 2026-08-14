/**
 * Official WHS (World Handicap System) Handicap Index — pure, no Dexie/React.
 *
 * This is the real thing, not the rough `handicapEstimate` in stats.ts. It
 * computes a Score Differential per round from the snapshotted course & slope
 * rating, then averages the best N of the last 20 per the WHS table.
 *
 * v1 scope & simplifications (documented so they can be refined later):
 *  - Only **complete 18-hole rounds** that carry `courseRating` + `slopeRating`
 *    contribute. 9-hole rounds are excluded (proper WHS 9-hole combination needs
 *    an established index to pair with an expected differential — a follow-up).
 *  - PCC (Playing Conditions Calculation) is fixed at 0 — we don't have it.
 *  - Adjusted Gross Score caps each hole at **net double bogey**
 *    (`par + 2 + strokes received`). Strokes received needs a Course Handicap,
 *    which needs an index → circular, so we run two passes: a provisional index
 *    from par+5-capped scores gives a provisional Course Handicap, then the final
 *    differentials use net-double-bogey caps from that. A player with no
 *    provisional index (too few rounds) falls back to a flat par+5 cap, matching
 *    the WHS maximum for a player without an established Handicap Index.
 *  - A minimum of 3 rated rounds is required to produce an Index (else null).
 */
import type { HoleEntry, Round } from '@/db/types'
import { computeTotals } from './round'

/** Highest Handicap Index the WHS allows. */
const MAX_INDEX = 54.0
/** Most-recent differentials considered when computing an Index. */
const SCORING_RECORD_SIZE = 20
/** Minimum rated rounds before an Index can be established. */
const MIN_ROUNDS = 3

/** Round to one decimal place (nearest tenth), avoiding fp drift. */
function toTenth(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * A rated, complete 18-hole round is eligible for the WHS calculation.
 * (18 holes with a score each, plus a usable course & slope rating.)
 */
export function isRatedRound(round: Round): boolean {
  if (round.roundLength !== '18') return false
  if (!round.courseRating || !round.slopeRating) return false
  return computeTotals(round.holes).isComplete
}

/**
 * WHS Course Handicap for a rated round at a given Index:
 *   round(Index × Slope / 113 + (CourseRating − Par))
 * Returns 0 when the round isn't rated (no strokes to distribute).
 */
export function courseHandicap(round: Round, index: number): number {
  if (!round.courseRating || !round.slopeRating) return 0
  const par = computeTotals(round.holes).totalPar
  return Math.round((index * round.slopeRating) / 113 + (round.courseRating - par))
}

/**
 * Handicap strokes received on a hole of the given stroke index (`handicap`)
 * for a whole-round Course Handicap. Plus-handicaps (≤0) receive none in v1.
 */
export function strokesReceived(courseHcp: number, strokeIndex: number): number {
  if (courseHcp <= 0) return 0
  const base = Math.floor(courseHcp / 18)
  const extra = strokeIndex <= courseHcp % 18 ? 1 : 0
  return base + extra
}

/** Net-double-bogey cap for one hole: par + 2 + strokes received. */
function netDoubleBogey(hole: HoleEntry, courseHcp: number): number {
  return hole.par + 2 + strokesReceived(courseHcp, hole.handicap)
}

/**
 * Adjusted Gross Score: sum of hole scores each capped for handicap purposes.
 * With a Course Handicap, the cap is net double bogey; without one (`null`),
 * the flat WHS maximum for an unestablished handicap, par + 5, is used.
 */
export function adjustedGrossScore(round: Round, courseHcp: number | null): number {
  let ags = 0
  for (const h of round.holes) {
    if (h.score === undefined) continue
    const cap = courseHcp === null ? h.par + 5 : netDoubleBogey(h, courseHcp)
    ags += Math.min(h.score, cap)
  }
  return ags
}

/**
 * WHS Score Differential for a rated round:
 *   (113 / Slope) × (AGS − CourseRating − PCC),  PCC = 0
 * `courseHcp` sets the net-double-bogey cap; `null` uses the par+5 fallback.
 * Rounded to one decimal. Returns null if the round isn't rated/complete.
 */
export function scoreDifferential(round: Round, courseHcp: number | null): number | null {
  if (!isRatedRound(round)) return null
  const ags = adjustedGrossScore(round, courseHcp)
  return toTenth((113 / round.slopeRating!) * (ags - round.courseRating!))
}

/**
 * WHS table: how many of the lowest differentials to average, and the
 * adjustment applied, given how many rated differentials are available.
 * (WHS 2020 Rule 5.2, "differentials to be used".)
 */
export function differentialsToUse(count: number): { use: number; adjustment: number } | null {
  if (count < MIN_ROUNDS) return null
  if (count === 3) return { use: 1, adjustment: -2.0 }
  if (count === 4) return { use: 1, adjustment: -1.0 }
  if (count === 5) return { use: 1, adjustment: 0 }
  if (count === 6) return { use: 2, adjustment: -1.0 }
  if (count <= 8) return { use: 2, adjustment: 0 }
  if (count <= 11) return { use: 3, adjustment: 0 }
  if (count <= 14) return { use: 4, adjustment: 0 }
  if (count <= 16) return { use: 5, adjustment: 0 }
  if (count <= 18) return { use: 6, adjustment: 0 }
  if (count === 19) return { use: 7, adjustment: 0 }
  return { use: 8, adjustment: 0 }
}

/** Average the `use` lowest values, then add the adjustment. */
function averageLowest(differentials: number[], use: number, adjustment: number): number {
  const lowest = [...differentials].sort((a, b) => a - b).slice(0, use)
  const avg = lowest.reduce((sum, d) => sum + d, 0) / lowest.length
  return toTenth(avg + adjustment)
}

export interface WhsIndex {
  /** The Handicap Index, e.g. 12.4. */
  value: number
  /** How many differentials were averaged (the "use" from the WHS table). */
  differentialsUsed: number
  /** How many rated rounds fed the calculation (≤ 20). */
  ratedRoundCount: number
}

/**
 * Compute the official WHS Handicap Index over the given rounds (assumed
 * newest-first). Returns null when fewer than 3 rated 18-hole rounds exist.
 *
 * Two passes handle the AGS ↔ index circularity: pass 1 uses par+5-capped
 * scores for a provisional index; pass 2 recomputes each differential with a
 * net-double-bogey cap from that provisional index. If pass 1 can't produce an
 * index the provisional stays null and pass 2 keeps the par+5 cap.
 */
export function whsIndex(rounds: Round[]): WhsIndex | null {
  const rated = rounds.filter(isRatedRound).slice(0, SCORING_RECORD_SIZE)
  const table = differentialsToUse(rated.length)
  if (!table) return null

  // Pass 1 — provisional index from flat par+5 caps (no Course Handicap yet).
  const provisional = rated.map((r) => scoreDifferential(r, null)!)
  const provisionalIndex = averageLowest(provisional, table.use, table.adjustment)

  // Pass 2 — final differentials with net-double-bogey caps from that index.
  const finalDiffs = rated.map((r) => scoreDifferential(r, courseHandicap(r, provisionalIndex))!)
  const value = Math.min(averageLowest(finalDiffs, table.use, table.adjustment), MAX_INDEX)

  return { value, differentialsUsed: table.use, ratedRoundCount: rated.length }
}
