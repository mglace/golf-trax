/**
 * Pure helpers for rendering a scorecard grid and color-coding scores relative
 * to par. Handles 9-hole rounds (holes + TOT) and 18-hole rounds
 * (front + OUT + back + IN + TOT).
 */
import type { HoleEntry, RoundLength } from '@/db/types'

export interface HoleColumn {
  type: 'hole'
  holeIndex: number
  label: string
  par: number
  score?: number
}

export interface SubtotalColumn {
  type: 'subtotal'
  label: 'OUT' | 'IN' | 'TOT'
  par: number
  score?: number
}

export type ScorecardColumn = HoleColumn | SubtotalColumn

function sumPar(holes: HoleEntry[]): number {
  return holes.reduce((acc, h) => acc + h.par, 0)
}

/** Sum of entered scores; undefined when none of the holes have a score yet. */
function sumScores(holes: HoleEntry[]): number | undefined {
  let total = 0
  let any = false
  for (const h of holes) {
    if (h.score !== undefined) {
      total += h.score
      any = true
    }
  }
  return any ? total : undefined
}

function holeColumns(holes: HoleEntry[], offset: number): HoleColumn[] {
  return holes.map((h, i) => ({
    type: 'hole',
    holeIndex: offset + i,
    label: String(h.holeNumber),
    par: h.par,
    score: h.score,
  }))
}

/**
 * Build the ordered columns for the scorecard. For 18-hole rounds the front and
 * back nines get OUT/IN subtotals plus a grand TOT; 9-hole rounds get a single
 * TOT.
 */
export function buildScorecard(holes: HoleEntry[], roundLength: RoundLength): ScorecardColumn[] {
  if (roundLength === '18' && holes.length > 9) {
    const front = holes.slice(0, 9)
    const back = holes.slice(9)
    return [
      ...holeColumns(front, 0),
      { type: 'subtotal', label: 'OUT', par: sumPar(front), score: sumScores(front) },
      ...holeColumns(back, 9),
      { type: 'subtotal', label: 'IN', par: sumPar(back), score: sumScores(back) },
      { type: 'subtotal', label: 'TOT', par: sumPar(holes), score: sumScores(holes) },
    ]
  }

  return [
    ...holeColumns(holes, 0),
    { type: 'subtotal', label: 'TOT', par: sumPar(holes), score: sumScores(holes) },
  ]
}

export type ScoreTone = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'empty'

/** Classify a score relative to par for color-coding. */
export function scoreTone(score: number | undefined, par: number): ScoreTone {
  if (score === undefined) return 'empty'
  const diff = score - par
  if (diff <= -2) return 'eagle'
  if (diff === -1) return 'birdie'
  if (diff === 0) return 'par'
  if (diff === 1) return 'bogey'
  return 'double'
}

/** Tailwind classes for a score cell by tone. */
export const SCORE_TONE_CLASS: Record<ScoreTone, string> = {
  // Under par: filled green circle. Over par: amber/red. Par: plain.
  eagle: 'bg-fairway-700 text-white rounded-full',
  birdie: 'bg-fairway-500 text-white rounded-full',
  par: 'text-slate-800',
  bogey: 'bg-amber-100 text-amber-800 rounded-md',
  double: 'bg-red-100 text-red-700 rounded-md',
  empty: 'text-slate-500',
}
