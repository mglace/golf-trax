import { describe, it, expect } from 'vitest'
import { buildScorecard, scoreTone } from './scorecard'
import type { HoleEntry } from '@/db/types'

function holes(count: number, startNumber = 1): HoleEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    holeNumber: startNumber + i,
    par: 4,
    handicap: i + 1,
    yardage: 400,
    score: 5,
  }))
}

describe('buildScorecard', () => {
  it('produces holes + single TOT for a 9-hole round', () => {
    const cols = buildScorecard(holes(9), 'front9')
    expect(cols).toHaveLength(10)
    const tot = cols[9]
    expect(tot).toMatchObject({ type: 'subtotal', label: 'TOT', par: 36, score: 45 })
  })

  it('labels back-9 holes by their real hole numbers', () => {
    const cols = buildScorecard(holes(9, 10), 'back9')
    expect(cols[0]).toMatchObject({ type: 'hole', label: '10' })
    expect(cols[8]).toMatchObject({ type: 'hole', label: '18' })
  })

  it('inserts OUT, IN, and TOT for an 18-hole round', () => {
    const cols = buildScorecard(holes(18), '18')
    // 9 holes + OUT + 9 holes + IN + TOT
    expect(cols).toHaveLength(21)
    expect(cols[9]).toMatchObject({ label: 'OUT', par: 36, score: 45 })
    expect(cols[19]).toMatchObject({ label: 'IN', par: 36, score: 45 })
    expect(cols[20]).toMatchObject({ label: 'TOT', par: 72, score: 90 })
  })

  it('leaves subtotal score undefined when no holes are scored', () => {
    const blank = holes(9).map((h) => ({ ...h, score: undefined }))
    const cols = buildScorecard(blank, 'front9')
    expect(cols[9]).toMatchObject({ label: 'TOT', score: undefined })
  })
})

describe('scoreTone', () => {
  it('classifies scores relative to par', () => {
    expect(scoreTone(2, 4)).toBe('eagle')
    expect(scoreTone(3, 4)).toBe('birdie')
    expect(scoreTone(4, 4)).toBe('par')
    expect(scoreTone(5, 4)).toBe('bogey')
    expect(scoreTone(6, 4)).toBe('double')
    expect(scoreTone(7, 4)).toBe('double')
    expect(scoreTone(undefined, 4)).toBe('empty')
  })
})
