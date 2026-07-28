import { describe, it, expect } from 'vitest'
import {
  holeIndicesFor,
  availableRoundLengths,
  buildHoles,
  deriveGir,
  fairwayApplies,
  computeTotals,
  computeRoundStats,
} from './round'
import type { ApiTeeBox } from '@/api/types'
import type { HoleEntry } from '@/db/types'

function tee18(): ApiTeeBox {
  return {
    tee_name: 'Blue',
    course_rating: 72,
    slope_rating: 130,
    bogey_rating: 95,
    total_yards: 6800,
    total_meters: 6218,
    number_of_holes: 18,
    par_total: 72,
    front_course_rating: 36,
    front_slope_rating: 130,
    front_bogey_rating: 47,
    back_course_rating: 36,
    back_slope_rating: 130,
    back_bogey_rating: 47,
    // Hole n: par 4, yardage 300+n, handicap n
    holes: Array.from({ length: 18 }, (_, i) => ({
      par: 4,
      yardage: 300 + i,
      handicap: i + 1,
    })),
  }
}

describe('holeIndicesFor', () => {
  it('front9 → indices 0-8', () => {
    expect(holeIndicesFor('front9', 18)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })
  it('back9 → indices 9-17', () => {
    expect(holeIndicesFor('back9', 18)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17])
  })
  it('18 → indices 0-17', () => {
    expect(holeIndicesFor('18', 18)).toHaveLength(18)
  })
  it('clamps to available holes (9-hole course)', () => {
    expect(holeIndicesFor('back9', 9)).toEqual([])
    expect(holeIndicesFor('front9', 9)).toHaveLength(9)
  })
})

describe('availableRoundLengths', () => {
  it('offers all three for an 18-hole tee', () => {
    expect(availableRoundLengths(18)).toEqual(['front9', 'back9', '18'])
  })
  it('offers only front9 for a 9-hole tee', () => {
    expect(availableRoundLengths(9)).toEqual(['front9'])
  })
})

describe('buildHoles', () => {
  it('numbers back-9 holes 10-18 and snapshots par/handicap/yardage', () => {
    const holes = buildHoles(tee18(), 'back9')
    expect(holes).toHaveLength(9)
    expect(holes[0]).toEqual({ holeNumber: 10, par: 4, handicap: 10, yardage: 309 })
    expect(holes[8].holeNumber).toBe(18)
  })
  it('front9 starts at hole 1', () => {
    const holes = buildHoles(tee18(), 'front9')
    expect(holes[0].holeNumber).toBe(1)
    expect(holes).toHaveLength(9)
  })
})

describe('deriveGir', () => {
  it('is true when the green was reached in regulation (par 4, 2 to green)', () => {
    // score 4, putts 2 → strokes to green 2 ≤ par-2 (2)
    expect(deriveGir(4, 4, 2)).toBe(true)
  })
  it('is false when it took too many strokes to reach the green', () => {
    // score 5, putts 2 → 3 to green > 2
    expect(deriveGir(4, 5, 2)).toBe(false)
  })
  it('handles a par 3 (green in regulation = on in 1)', () => {
    expect(deriveGir(3, 3, 2)).toBe(true) // 1 to green ≤ 1
    expect(deriveGir(3, 3, 1)).toBe(false) // 2 to green > 1
  })
  it('is undefined when putts are missing', () => {
    expect(deriveGir(4, 4, undefined)).toBeUndefined()
    expect(deriveGir(4, undefined, 2)).toBeUndefined()
  })
})

describe('fairwayApplies', () => {
  it('applies to par 4 and 5 only', () => {
    expect(fairwayApplies(3)).toBe(false)
    expect(fairwayApplies(4)).toBe(true)
    expect(fairwayApplies(5)).toBe(true)
  })
})

describe('computeTotals', () => {
  const holes: HoleEntry[] = [
    { holeNumber: 1, par: 4, handicap: 1, yardage: 400, score: 5 },
    { holeNumber: 2, par: 3, handicap: 2, yardage: 180, score: 3 },
    { holeNumber: 3, par: 5, handicap: 3, yardage: 520 }, // not entered
  ]

  it('sums par over all holes but score/vs-par over entered holes only', () => {
    const t = computeTotals(holes)
    expect(t.totalPar).toBe(12)
    expect(t.totalScore).toBe(8)
    expect(t.playedPar).toBe(7)
    expect(t.vsPar).toBe(1)
    expect(t.holesEntered).toBe(2)
    expect(t.isComplete).toBe(false)
  })

  it('marks complete when every hole has a score', () => {
    const done = holes.map((h) => ({ ...h, score: h.score ?? h.par }))
    expect(computeTotals(done).isComplete).toBe(true)
  })
})

describe('computeRoundStats', () => {
  it('scopes fairway% to eligible+recorded holes and GIR% to known holes', () => {
    const holes: HoleEntry[] = [
      // par 3 — fairway not applicable; putts known → gir known
      { holeNumber: 1, par: 3, handicap: 5, yardage: 180, score: 3, putts: 2, gir: true },
      // par 4 — fairway hit, putts known, gir true
      { holeNumber: 2, par: 4, handicap: 1, yardage: 420, score: 4, fairwayHit: true, putts: 2, gir: true },
      // par 4 — fairway miss, no putts → gir unknown
      { holeNumber: 3, par: 4, handicap: 3, yardage: 400, score: 6, fairwayHit: false },
      // par 5 — no fairway recorded, putts known, gir false
      { holeNumber: 4, par: 5, handicap: 7, yardage: 540, score: 7, putts: 3, gir: false },
    ]
    const s = computeRoundStats(holes)
    expect(s.fairwayOpportunities).toBe(2) // holes 2 and 3
    expect(s.fairwaysHit).toBe(1)
    expect(s.fairwayPct).toBe(50)
    expect(s.girKnown).toBe(3) // holes 1, 2, 4
    expect(s.girHit).toBe(2)
    expect(s.girPct).toBeCloseTo(66.666, 2)
    expect(s.totalPutts).toBe(7)
    expect(s.puttsKnown).toBe(3)
  })

  it('returns null percentages when nothing is known', () => {
    const holes: HoleEntry[] = [{ holeNumber: 1, par: 3, handicap: 1, yardage: 180, score: 3 }]
    const s = computeRoundStats(holes)
    expect(s.fairwayPct).toBeNull()
    expect(s.girPct).toBeNull()
  })
})
