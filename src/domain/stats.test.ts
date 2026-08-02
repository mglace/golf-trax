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
