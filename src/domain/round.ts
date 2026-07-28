/**
 * Pure round logic: building a round's holes from a tee box, deriving GIR,
 * and computing totals/stats. No React or Dexie here so it's unit-testable.
 */
import type { ApiTeeBox } from '@/api/types'
import type { HoleEntry, RoundLength } from '@/db/types'

export const ROUND_LENGTH_LABEL: Record<RoundLength, string> = {
  front9: 'Front 9',
  back9: 'Back 9',
  '18': 'Full 18',
}

/** Format a score-to-par as "E", "+3", or "-2". */
export function formatVsPar(vsPar: number): string {
  if (vsPar === 0) return 'E'
  return vsPar > 0 ? `+${vsPar}` : `${vsPar}`
}

/** Number of holes in a given round length. */
export function holeCount(roundLength: RoundLength): number {
  return roundLength === '18' ? 18 : 9
}

/**
 * The 0-based indices into a tee box's `holes` array for a round length.
 * front9 → 0-8, back9 → 9-17, 18 → 0-17. Clamped to the holes actually
 * available (some courses only publish 9 holes).
 */
export function holeIndicesFor(roundLength: RoundLength, availableHoles: number): number[] {
  const start = roundLength === 'back9' ? 9 : 0
  const end = roundLength === '18' ? 18 : start + 9
  const indices: number[] = []
  for (let i = start; i < end && i < availableHoles; i++) indices.push(i)
  return indices
}

/**
 * Which round lengths are selectable given a tee box's hole count. An 18-hole
 * tee supports all three; a 9-hole tee supports only Front 9.
 */
export function availableRoundLengths(numberOfHoles: number): RoundLength[] {
  if (numberOfHoles >= 18) return ['front9', 'back9', '18']
  return ['front9']
}

/**
 * Snapshot the holes for a new round from the selected tee box. `holeNumber` is
 * the absolute number on the course (back-9 rounds are holes 10-18).
 */
export function buildHoles(tee: ApiTeeBox, roundLength: RoundLength): HoleEntry[] {
  const indices = holeIndicesFor(roundLength, tee.holes?.length ?? 0)
  return indices.map((i) => {
    const h = tee.holes[i]
    return {
      holeNumber: i + 1,
      par: h.par,
      handicap: h.handicap,
      yardage: h.yardage,
    }
  })
}

/**
 * Greens in regulation, derived only when putts are known:
 *   gir = (score - putts) <= (par - 2)
 * Returns undefined when score or putts is missing (GIR "not tracked").
 */
export function deriveGir(
  par: number,
  score: number | undefined,
  putts: number | undefined,
): boolean | undefined {
  if (score === undefined || putts === undefined) return undefined
  const strokesToGreen = score - putts
  return strokesToGreen <= par - 2
}

/** Fairway is only a meaningful stat on par 4s and 5s. */
export function fairwayApplies(par: number): boolean {
  return par >= 4
}

export interface RoundTotals {
  /** Sum of par across all holes in the round (fixed once holes are built). */
  totalPar: number
  /** Sum of entered scores. */
  totalScore: number
  /** Number of holes with a score entered. */
  holesEntered: number
  /** Total holes in the round. */
  holesTotal: number
  /** Par summed over only the entered holes (for a fair vs-par while in progress). */
  playedPar: number
  /** totalScore − playedPar. */
  vsPar: number
  /** True when every hole has a score. */
  isComplete: boolean
}

export function computeTotals(holes: HoleEntry[]): RoundTotals {
  let totalPar = 0
  let totalScore = 0
  let playedPar = 0
  let holesEntered = 0
  for (const h of holes) {
    totalPar += h.par
    if (h.score !== undefined) {
      totalScore += h.score
      playedPar += h.par
      holesEntered += 1
    }
  }
  return {
    totalPar,
    totalScore,
    holesEntered,
    holesTotal: holes.length,
    playedPar,
    vsPar: totalScore - playedPar,
    isComplete: holes.length > 0 && holesEntered === holes.length,
  }
}

export interface RoundStats {
  fairwaysHit: number
  fairwayOpportunities: number
  /** null when no fairway-eligible holes have been recorded. */
  fairwayPct: number | null
  girHit: number
  /** Holes where GIR could be determined (putts entered). */
  girKnown: number
  /** null when GIR couldn't be determined on any hole. */
  girPct: number | null
  totalPutts: number
  /** Holes with putts recorded. */
  puttsKnown: number
}

/**
 * Fairway% and GIR% scoped to the holes where each is actually known:
 *  - fairways: only par 4/5 holes where fairwayHit was recorded
 *  - GIR: only holes where putts were entered (so GIR could be derived)
 */
export function computeRoundStats(holes: HoleEntry[]): RoundStats {
  let fairwaysHit = 0
  let fairwayOpportunities = 0
  let girHit = 0
  let girKnown = 0
  let totalPutts = 0
  let puttsKnown = 0

  for (const h of holes) {
    if (fairwayApplies(h.par) && h.fairwayHit !== undefined) {
      fairwayOpportunities += 1
      if (h.fairwayHit) fairwaysHit += 1
    }
    if (h.gir !== undefined) {
      girKnown += 1
      if (h.gir) girHit += 1
    }
    if (h.putts !== undefined) {
      totalPutts += h.putts
      puttsKnown += 1
    }
  }

  return {
    fairwaysHit,
    fairwayOpportunities,
    fairwayPct: fairwayOpportunities > 0 ? (fairwaysHit / fairwayOpportunities) * 100 : null,
    girHit,
    girKnown,
    girPct: girKnown > 0 ? (girHit / girKnown) * 100 : null,
    totalPutts,
    puttsKnown,
  }
}
