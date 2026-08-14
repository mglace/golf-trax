import { describe, it, expect } from 'vitest'
import {
  roundScore,
  scoringSummary,
  handicapEstimate,
  playSummary,
  holeDifficulty,
  courseBreakdown,
  courseOptions,
  trendSeries,
  windowRounds,
  scoringDistribution,
  puttingStats,
  teeBreakdown,
} from './stats'
import type { HoleEntry, Round, RoundLength } from '@/db/types'

let uid = 0
function makeRound(opts: {
  vsPar: number
  length: RoundLength
  date: string
  courseId?: string
  courseName?: string
  fairways?: boolean
  putts?: number
}): Round {
  const holeCount = opts.length === '18' ? 18 : 9
  const startNumber = opts.length === 'back9' ? 10 : 1
  // Distribute vsPar across the first holes as +1 bogeys (or -1 birdies).
  const holes: HoleEntry[] = Array.from({ length: holeCount }, (_, i) => {
    const par = 4
    const delta = i < Math.abs(opts.vsPar) ? Math.sign(opts.vsPar) : 0
    return {
      holeNumber: startNumber + i,
      par,
      handicap: i + 1,
      yardage: 400,
      score: par + delta,
      ...(opts.fairways !== undefined ? { fairwayHit: opts.fairways } : {}),
      ...(opts.putts !== undefined ? { putts: opts.putts, gir: par + delta - opts.putts <= par - 2 } : {}),
    }
  })
  return {
    id: `r${uid++}`,
    courseId: opts.courseId ?? '1',
    courseName: opts.courseName ?? 'Test Course',
    clubName: 'Test',
    gender: 'male',
    teeName: 'Blue',
    roundLength: opts.length,
    status: 'complete',
    date: opts.date,
    holes,
    updatedAt: opts.date,
  }
}

describe('roundScore', () => {
  it('normalizes a 9-hole round to an 18-hole equivalent', () => {
    // 9-hole round, +4 over par → per-18 equivalent +8.
    const r = makeRound({ vsPar: 4, length: 'front9', date: '2026-07-01' })
    const s = roundScore(r)!
    expect(s.vsPar).toBe(4)
    expect(s.vsPar18).toBeCloseTo(8, 5)
    expect(s.score18).toBeCloseTo((40 / 9) * 18, 5) // 40 strokes over 9 holes
  })

  it('returns null for a round with no scores', () => {
    const r = makeRound({ vsPar: 0, length: '18', date: '2026-07-01' })
    r.holes = r.holes.map((h) => ({ ...h, score: undefined }))
    expect(roundScore(r)).toBeNull()
  })
})

describe('scoringSummary', () => {
  it('averages vs-par and finds best/worst on an 18-equiv basis', () => {
    const rounds = [
      makeRound({ vsPar: 6, length: '18', date: '2026-07-03' }), // +6
      makeRound({ vsPar: 2, length: '18', date: '2026-07-02' }), // +2 (best)
      makeRound({ vsPar: 4, length: 'front9', date: '2026-07-01' }), // +4 over 9 → +8 (worst)
    ]
    const s = scoringSummary(rounds)
    expect(s.count).toBe(3)
    expect(s.avgVsPar18).toBeCloseTo((6 + 2 + 8) / 3, 5)
    expect(s.best!.vsPar18).toBeCloseTo(2, 5)
    expect(s.worst!.vsPar18).toBeCloseTo(8, 5)
  })

  it('handles an empty set', () => {
    expect(scoringSummary([])).toMatchObject({ count: 0, avgVsPar18: null, best: null })
  })
})

describe('handicapEstimate', () => {
  it('averages 18-equiv vs par over up to the last 10 rounds', () => {
    const rounds = Array.from({ length: 12 }, (_, i) =>
      makeRound({ vsPar: i, length: '18', date: `2026-07-${String(i + 1).padStart(2, '0')}` }),
    )
    // rounds newest-first: vsPar 0..11 in array order already (index 0 = +0)
    const est = handicapEstimate(rounds)!
    expect(est.sampleSize).toBe(10)
    expect(est.value).toBeCloseTo((0 + 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9) / 10, 5)
  })

  it('is null with no rounds', () => {
    expect(handicapEstimate([])).toBeNull()
  })
})

describe('playSummary', () => {
  it('aggregates fairway %, GIR %, putts across rounds', () => {
    const rounds = [
      makeRound({ vsPar: 0, length: '18', date: '2026-07-02', fairways: true, putts: 2 }),
      makeRound({ vsPar: 0, length: '18', date: '2026-07-01', fairways: false, putts: 2 }),
    ]
    const s = playSummary(rounds)
    // All holes par 4 → fairway applies to all 36 holes; 18 hit, 18 missed → 50%.
    expect(s.fairwayPct).toBe(50)
    expect(s.avgPutts).toBe(2)
    // par 4, score 4, putts 2 → 2 to green ≤ 2 → GIR true on all → 100%.
    expect(s.girPct).toBe(100)
  })
})

describe('holeDifficulty', () => {
  it('ranks holes by average score-to-par, hardest first', () => {
    const rounds = [
      makeRound({ vsPar: 2, length: 'front9', date: '2026-07-02' }), // holes 1,2 = +1
      makeRound({ vsPar: 1, length: 'front9', date: '2026-07-01' }), // hole 1 = +1
    ]
    const d = holeDifficulty(rounds, 2)
    // Only holes played >= 2 times qualify. Hole 1 played twice (both +1 → avg 1).
    const hole1 = d.find((h) => h.holeNumber === 1)
    expect(hole1).toMatchObject({ avgVsPar: 1, samples: 2 })
  })
})

describe('courseBreakdown', () => {
  it('includes only courses with enough rounds', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      makeRound({ vsPar: 4, length: '18', date: `2026-06-0${i + 1}`, courseId: '7', courseName: 'A' }),
    )
    const few = [makeRound({ vsPar: 2, length: '18', date: '2026-06-10', courseId: '9', courseName: 'B' })]
    const stats = courseBreakdown([...many, ...few], 5)
    expect(stats).toHaveLength(1)
    expect(stats[0]).toMatchObject({ courseId: '7', count: 5 })
  })
})

describe('courseOptions', () => {
  it('lists distinct courses sorted by round count, then name', () => {
    const rounds = [
      makeRound({ vsPar: 2, length: '18', date: '2026-06-05', courseId: '9', courseName: 'Bravo' }),
      makeRound({ vsPar: 3, length: '18', date: '2026-06-04', courseId: '7', courseName: 'Alpha' }),
      makeRound({ vsPar: 4, length: '18', date: '2026-06-03', courseId: '7', courseName: 'Alpha' }),
      makeRound({ vsPar: 1, length: '18', date: '2026-06-02', courseId: '3', courseName: 'Charlie' }),
    ]
    const opts = courseOptions(rounds)
    expect(opts).toEqual([
      { courseId: '7', courseName: 'Alpha', count: 2 },
      { courseId: '9', courseName: 'Bravo', count: 1 },
      { courseId: '3', courseName: 'Charlie', count: 1 },
    ])
  })

  it('uses the most recent name for a course (rounds are newest-first)', () => {
    const rounds = [
      makeRound({ vsPar: 2, length: '18', date: '2026-06-05', courseId: '7', courseName: 'Renamed Links' }),
      makeRound({ vsPar: 3, length: '18', date: '2026-06-04', courseId: '7', courseName: 'Old Name' }),
    ]
    expect(courseOptions(rounds)).toEqual([{ courseId: '7', courseName: 'Renamed Links', count: 2 }])
  })

  it('returns an empty list for no rounds', () => {
    expect(courseOptions([])).toEqual([])
  })
})

describe('trendSeries + windowRounds', () => {
  it('returns the last n rounds oldest→newest', () => {
    const rounds = Array.from({ length: 12 }, (_, i) =>
      makeRound({ vsPar: i, length: '18', date: `2026-07-${String(i + 1).padStart(2, '0')}` }),
    )
    const trend = trendSeries(rounds, 10)
    expect(trend).toHaveLength(10)
    // newest-first sliced (vsPar 0..9), reversed → first point is vsPar 9.
    expect(trend[0].vsPar18).toBe(9)
    expect(trend[9].vsPar18).toBe(0)
  })

  it('windowRounds slices most-recent N', () => {
    const rounds = Array.from({ length: 5 }, (_, i) =>
      makeRound({ vsPar: 0, length: '18', date: `2026-07-0${i + 1}` }),
    )
    expect(windowRounds(rounds, 'all')).toHaveLength(5)
    expect(windowRounds(rounds, 10)).toHaveLength(5)
  })
})

describe('scoringDistribution', () => {
  it('buckets pars/bogeys and computes par-type averages', () => {
    // 18-hole round: makeRound distributes +1 bogeys first → 3 bogeys, 15 pars.
    const dist = scoringDistribution([makeRound({ vsPar: 3, length: '18', date: '2026-07-01' })])
    expect(dist.total).toBe(18)
    expect(dist.pars).toBe(15)
    expect(dist.bogeys).toBe(3)
    expect(dist.byParType).toHaveLength(1)
    expect(dist.byParType[0]).toMatchObject({ par: 4, count: 18 })
    expect(dist.byParType[0].avgVsPar).toBeCloseTo(3 / 18, 5)
  })

  it('classifies eagles, birdies, doubles and triple-plus by par type', () => {
    const holes: HoleEntry[] = [
      { holeNumber: 1, par: 5, handicap: 1, yardage: 500, score: 3 }, // eagle (−2)
      { holeNumber: 2, par: 4, handicap: 2, yardage: 400, score: 3 }, // birdie
      { holeNumber: 3, par: 4, handicap: 3, yardage: 400, score: 4 }, // par
      { holeNumber: 4, par: 4, handicap: 4, yardage: 400, score: 5 }, // bogey
      { holeNumber: 5, par: 3, handicap: 5, yardage: 180, score: 5 }, // double
      { holeNumber: 6, par: 3, handicap: 6, yardage: 180, score: 7 }, // triple+ (+4)
    ]
    const round: Round = { ...makeRound({ vsPar: 0, length: 'front9', date: '2026-07-01' }), holes }
    const dist = scoringDistribution([round])
    expect(dist).toMatchObject({
      total: 6,
      eagles: 1,
      birdies: 1,
      pars: 1,
      bogeys: 1,
      doubles: 1,
      triplesPlus: 1,
    })
    expect(dist.byParType.map((p) => p.par)).toEqual([3, 4, 5])
  })
})

describe('puttingStats', () => {
  it('computes 1-putt %, 3-putt %, and putts per GIR', () => {
    const holes: HoleEntry[] = [
      { holeNumber: 1, par: 4, handicap: 1, yardage: 400, score: 4, putts: 1, gir: false },
      { holeNumber: 2, par: 4, handicap: 2, yardage: 400, score: 4, putts: 2, gir: true },
      { holeNumber: 3, par: 4, handicap: 3, yardage: 400, score: 6, putts: 3, gir: false },
      { holeNumber: 4, par: 4, handicap: 4, yardage: 400, score: 4, putts: 2, gir: true },
    ]
    const round: Round = { ...makeRound({ vsPar: 0, length: 'front9', date: '2026-07-01' }), holes }
    const s = puttingStats([round])
    expect(s.holesWithPutts).toBe(4)
    expect(s.onePuttPct).toBe(25)
    expect(s.threePuttPct).toBe(25)
    expect(s.puttsPerGir).toBe(2) // (2 + 2) / 2 GIR holes
  })

  it('is null when no putts are recorded', () => {
    const s = puttingStats([makeRound({ vsPar: 0, length: '18', date: '2026-07-01' })])
    expect(s).toMatchObject({ onePuttPct: null, threePuttPct: null, puttsPerGir: null })
  })
})

describe('teeBreakdown', () => {
  it('includes only tees with enough rounds, sorted by count', () => {
    const blue = Array.from({ length: 3 }, (_, i) => ({
      ...makeRound({ vsPar: 4, length: '18', date: `2026-06-0${i + 1}` }),
      teeName: 'Blue',
    }))
    const white = [
      { ...makeRound({ vsPar: 2, length: '18', date: '2026-06-10' }), teeName: 'White' },
    ]
    const stats = teeBreakdown([...blue, ...white], 3)
    expect(stats).toHaveLength(1)
    expect(stats[0]).toMatchObject({ teeName: 'Blue', count: 3 })
  })
})
