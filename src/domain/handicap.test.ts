import { describe, it, expect } from 'vitest'
import {
  isRatedRound,
  courseHandicap,
  strokesReceived,
  adjustedGrossScore,
  scoreDifferential,
  differentialsToUse,
  whsIndex,
} from './handicap'
import type { HoleEntry, Round, RoundLength } from '@/db/types'

let uid = 0

/**
 * Build a rated 18-hole round of par 72 (all par-4 holes), course rating 72 and
 * slope 113, whose gross is `gross` using only scores of 4 or 5 (so no hole ever
 * exceeds a net-double-bogey or par+5 cap). With slope 113 and CR = par, the
 * Score Differential reduces to `gross − 72`, which makes hand-checking trivial.
 */
function ratedRound(
  gross: number,
  opts: { date?: string; courseRating?: number; slopeRating?: number } = {},
): Round {
  const fives = gross - 72 // remaining holes are pars (4)
  const holes: HoleEntry[] = Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    par: 4,
    handicap: i + 1,
    yardage: 400,
    score: i < fives ? 5 : 4,
  }))
  return {
    id: `h${uid++}`,
    courseId: '1',
    courseName: 'Test',
    clubName: 'Test',
    gender: 'male',
    teeName: 'Blue',
    roundLength: '18',
    status: 'complete',
    date: opts.date ?? '2026-07-01',
    holes,
    courseRating: opts.courseRating ?? 72,
    slopeRating: opts.slopeRating ?? 113,
    updatedAt: opts.date ?? '2026-07-01',
  }
}

/** A single-hole round scaffold for cap/differential math. */
function roundWithHoles(holes: HoleEntry[], over: Partial<Round> = {}): Round {
  return {
    id: `h${uid++}`,
    courseId: '1',
    courseName: 'Test',
    clubName: 'Test',
    gender: 'male',
    teeName: 'Blue',
    roundLength: '18',
    status: 'complete',
    date: '2026-07-01',
    holes,
    courseRating: 72,
    slopeRating: 113,
    updatedAt: '2026-07-01',
    ...over,
  }
}

function par4Holes(scores: number[]): HoleEntry[] {
  return scores.map((score, i) => ({
    holeNumber: i + 1,
    par: 4,
    handicap: i + 1,
    yardage: 400,
    score,
  }))
}

describe('isRatedRound', () => {
  it('accepts a complete, rated 18-hole round', () => {
    expect(isRatedRound(ratedRound(90))).toBe(true)
  })
  it('rejects rounds missing a rating', () => {
    expect(isRatedRound(ratedRound(90, { slopeRating: 0 }))).toBe(false)
    const noCr = ratedRound(90)
    noCr.courseRating = undefined
    expect(isRatedRound(noCr)).toBe(false)
  })
  it('rejects 9-hole rounds', () => {
    const r = ratedRound(90)
    r.roundLength = 'front9' as RoundLength
    r.holes = r.holes.slice(0, 9)
    expect(isRatedRound(r)).toBe(false)
  })
  it('rejects an incomplete round', () => {
    const r = ratedRound(90)
    r.holes[0] = { ...r.holes[0], score: undefined }
    expect(isRatedRound(r)).toBe(false)
  })
})

describe('courseHandicap', () => {
  it('equals the index when slope is 113 and CR equals par', () => {
    expect(courseHandicap(ratedRound(90), 10)).toBe(10)
  })
  it('applies slope and the CR − par term, rounded', () => {
    // 10 × 125/113 + (70.5 − 72) = 11.06 − 1.5 = 9.56 → 10
    expect(courseHandicap(ratedRound(90, { slopeRating: 125, courseRating: 70.5 }), 10)).toBe(10)
  })
})

describe('strokesReceived', () => {
  it('gives none for a scratch/plus handicap', () => {
    expect(strokesReceived(0, 1)).toBe(0)
    expect(strokesReceived(-3, 1)).toBe(0)
  })
  it('distributes one stroke per hole up to the course handicap', () => {
    expect(strokesReceived(5, 5)).toBe(1)
    expect(strokesReceived(5, 6)).toBe(0)
  })
  it('wraps for handicaps above 18', () => {
    expect(strokesReceived(20, 2)).toBe(2) // base 1 + extra on SI ≤ 2
    expect(strokesReceived(20, 3)).toBe(1) // base 1 only
    expect(strokesReceived(18, 18)).toBe(1) // every hole exactly one
  })
})

describe('adjustedGrossScore & scoreDifferential', () => {
  it('caps blow-up holes at net double bogey (course handicap 0)', () => {
    // 17 pars + one 12 on a par 4. Cap for CH 0 is par+2 = 6.
    const holes = par4Holes([...Array(17).fill(4), 12])
    const round = roundWithHoles(holes)
    expect(adjustedGrossScore(round, 0)).toBe(17 * 4 + 6) // 74
    // (113/113) × (74 − 72) = 2.0
    expect(scoreDifferential(round, 0)).toBe(2.0)
  })
  it('caps at par+5 when there is no established handicap (null)', () => {
    const holes = par4Holes([...Array(17).fill(4), 12])
    const round = roundWithHoles(holes)
    expect(adjustedGrossScore(round, null)).toBe(17 * 4 + 9) // 77
    expect(scoreDifferential(round, null)).toBe(5.0)
  })
  it('reduces to gross − 72 for a clean round at slope 113 / CR 72', () => {
    expect(scoreDifferential(ratedRound(90), null)).toBe(18.0)
    expect(scoreDifferential(ratedRound(72), null)).toBe(0.0)
  })
  it('returns null for an unrated round', () => {
    const r = ratedRound(90, { slopeRating: 0 })
    expect(scoreDifferential(r, null)).toBeNull()
  })
})

describe('differentialsToUse (WHS table)', () => {
  it('needs at least 3 differentials', () => {
    expect(differentialsToUse(2)).toBeNull()
  })
  it('matches WHS boundaries', () => {
    expect(differentialsToUse(3)).toEqual({ use: 1, adjustment: -2.0 })
    expect(differentialsToUse(4)).toEqual({ use: 1, adjustment: -1.0 })
    expect(differentialsToUse(5)).toEqual({ use: 1, adjustment: 0 })
    expect(differentialsToUse(6)).toEqual({ use: 2, adjustment: -1.0 })
    expect(differentialsToUse(8)).toEqual({ use: 2, adjustment: 0 })
    expect(differentialsToUse(9)).toEqual({ use: 3, adjustment: 0 })
    expect(differentialsToUse(12)).toEqual({ use: 4, adjustment: 0 })
    expect(differentialsToUse(15)).toEqual({ use: 5, adjustment: 0 })
    expect(differentialsToUse(17)).toEqual({ use: 6, adjustment: 0 })
    expect(differentialsToUse(19)).toEqual({ use: 7, adjustment: 0 })
    expect(differentialsToUse(20)).toEqual({ use: 8, adjustment: 0 })
  })
})

describe('whsIndex', () => {
  it('returns null below 3 rated rounds', () => {
    expect(whsIndex([ratedRound(90), ratedRound(85)])).toBeNull()
  })

  it('averages the lowest 1 of 3 with the −2.0 adjustment', () => {
    // diffs 18, 13, 8 → lowest 1 = 8, minus 2.0 → 6.0
    const idx = whsIndex([ratedRound(90), ratedRound(85), ratedRound(80)])!
    expect(idx.value).toBe(6.0)
    expect(idx.differentialsUsed).toBe(1)
    expect(idx.ratedRoundCount).toBe(3)
  })

  it('averages the lowest 2 of 6 with the −1.0 adjustment', () => {
    // grosses 90..80 → diffs 18,16,14,12,10,8 → lowest 2 = 8,10 → avg 9 − 1 = 8.0
    const idx = whsIndex(
      [90, 88, 86, 84, 82, 80].map((g) => ratedRound(g)),
    )!
    expect(idx.value).toBe(8.0)
    expect(idx.differentialsUsed).toBe(2)
  })

  it('uses only the most recent 20 and averages the lowest 8', () => {
    // 22 rounds, grosses 73..94; newest-first so the first 20 are 73..92.
    const rounds = Array.from({ length: 22 }, (_, i) => ratedRound(73 + i))
    const idx = whsIndex(rounds)!
    expect(idx.ratedRoundCount).toBe(20)
    expect(idx.differentialsUsed).toBe(8)
    // Lowest 8 differentials come from grosses 73..80 → diffs 1..8, avg 4.5.
    expect(idx.value).toBe(4.5)
  })

  it('excludes 9-hole and unrated rounds', () => {
    const nine = ratedRound(90)
    nine.roundLength = 'front9' as RoundLength
    nine.holes = nine.holes.slice(0, 9)
    const unrated = ratedRound(85, { slopeRating: 0 })
    const idx = whsIndex([ratedRound(90), nine, unrated, ratedRound(85), ratedRound(80)])!
    // Only the three rated 18s count → same as the 3-round case: 6.0
    expect(idx.ratedRoundCount).toBe(3)
    expect(idx.value).toBe(6.0)
  })
})
