/**
 * Pure statistics over completed rounds. To compare 9- and 18-hole rounds
 * fairly, scoring is normalized to an 18-hole equivalent (per-hole value × 18).
 * All functions assume the input rounds are sorted newest-first.
 */
import type { Round } from '@/db/types'
import { computeTotals, computeRoundStats } from './round'

export type StatsWindow = 'all' | 10 | 50

export interface RoundScore {
  round: Round
  holesEntered: number
  totalScore: number
  vsPar: number
  /** Score-to-par normalized to 18 holes. */
  vsPar18: number
  /** Total score normalized to 18 holes. */
  score18: number
}

/**
 * A round counts toward per-round stats only when every hole has a score.
 * This prevents a barely-entered round from being extrapolated to 18 holes and
 * skewing averages, handicap, and best/worst. (Per-hole stats still use all
 * holes played.)
 */
export function isScoreable(round: Round): boolean {
  return computeTotals(round.holes).isComplete
}

/** Per-round scoring info, or null if the round has no entered holes. */
export function roundScore(round: Round): RoundScore | null {
  const t = computeTotals(round.holes)
  if (t.holesEntered === 0) return null
  const perHoleVsPar = t.vsPar / t.holesEntered
  const perHoleScore = t.totalScore / t.holesEntered
  return {
    round,
    holesEntered: t.holesEntered,
    totalScore: t.totalScore,
    vsPar: t.vsPar,
    vsPar18: perHoleVsPar * 18,
    score18: perHoleScore * 18,
  }
}

/** Slice the most-recent N rounds (or all). */
export function windowRounds(rounds: Round[], window: StatsWindow): Round[] {
  return window === 'all' ? rounds : rounds.slice(0, window)
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export interface ScoringSummary {
  count: number
  avgScore18: number | null
  avgVsPar18: number | null
  best: RoundScore | null
  worst: RoundScore | null
}

/** Averages plus best/worst (by 18-hole-equivalent score-to-par). */
export function scoringSummary(rounds: Round[]): ScoringSummary {
  const scores = rounds.map(roundScore).filter((s): s is RoundScore => s !== null)
  if (scores.length === 0) {
    return { count: 0, avgScore18: null, avgVsPar18: null, best: null, worst: null }
  }
  let best = scores[0]
  let worst = scores[0]
  for (const s of scores) {
    if (s.vsPar18 < best.vsPar18) best = s
    if (s.vsPar18 > worst.vsPar18) worst = s
  }
  return {
    count: scores.length,
    avgScore18: mean(scores.map((s) => s.score18)),
    avgVsPar18: mean(scores.map((s) => s.vsPar18)),
    best,
    worst,
  }
}

export interface HandicapEstimate {
  /** 18-hole-equivalent score-to-par, averaged over the sample. */
  value: number
  sampleSize: number
}

/**
 * Handicap ESTIMATE (not USGA): rolling average of 18-hole-equivalent
 * score-to-par over the most recent up-to-10 rounds. Null if no scored rounds.
 */
export function handicapEstimate(rounds: Round[]): HandicapEstimate | null {
  const scores = rounds
    .slice(0, 10)
    .map(roundScore)
    .filter((s): s is RoundScore => s !== null)
  const avg = mean(scores.map((s) => s.vsPar18))
  if (avg === null) return null
  return { value: avg, sampleSize: scores.length }
}

export interface PlaySummary {
  fairwayPct: number | null
  girPct: number | null
  avgPutts: number | null
}

/** Fairway %, GIR %, and average putts aggregated across all holes played. */
export function playSummary(rounds: Round[]): PlaySummary {
  const allHoles = rounds.flatMap((r) => r.holes)
  const s = computeRoundStats(allHoles)
  return {
    fairwayPct: s.fairwayPct,
    girPct: s.girPct,
    avgPutts: s.puttsKnown > 0 ? s.totalPutts / s.puttsKnown : null,
  }
}

export interface HoleDifficulty {
  holeNumber: number
  avgVsPar: number
  samples: number
}

/**
 * Average score-to-par per hole number across the given rounds, for holes with
 * at least `minSamples` plays. Sorted hardest-first (highest avg over par).
 * (Aggregates across courses, so it's a rough personal tendency, not per-course.)
 */
export function holeDifficulty(rounds: Round[], minSamples = 2): HoleDifficulty[] {
  const acc = new Map<number, { sum: number; count: number }>()
  for (const r of rounds) {
    for (const h of r.holes) {
      if (h.score === undefined) continue
      const cur = acc.get(h.holeNumber) ?? { sum: 0, count: 0 }
      cur.sum += h.score - h.par
      cur.count += 1
      acc.set(h.holeNumber, cur)
    }
  }
  return [...acc.entries()]
    .filter(([, v]) => v.count >= minSamples)
    .map(([holeNumber, v]) => ({ holeNumber, avgVsPar: v.sum / v.count, samples: v.count }))
    .sort((a, b) => b.avgVsPar - a.avgVsPar)
}

export interface CourseStat {
  courseId: number
  courseName: string
  count: number
  avgVsPar18: number | null
  best: RoundScore | null
}

/** Per-course averages, only for courses with at least `minRounds` rounds. */
export function courseBreakdown(rounds: Round[], minRounds = 5): CourseStat[] {
  const byCourse = new Map<number, Round[]>()
  for (const r of rounds) {
    const list = byCourse.get(r.courseId) ?? []
    list.push(r)
    byCourse.set(r.courseId, list)
  }
  const stats: CourseStat[] = []
  for (const [courseId, list] of byCourse) {
    if (list.length < minRounds) continue
    const summary = scoringSummary(list)
    stats.push({
      courseId,
      courseName: list[0].courseName,
      count: list.length,
      avgVsPar18: summary.avgVsPar18,
      best: summary.best,
    })
  }
  return stats.sort((a, b) => b.count - a.count)
}

export interface TrendPoint {
  id: string
  label: string
  vsPar18: number
}

/**
 * Trend series of the last `n` rounds in chronological order (oldest → newest)
 * for the score-trend chart. Uses 18-hole-equivalent score-to-par.
 */
export function trendSeries(rounds: Round[], n = 10): TrendPoint[] {
  const recent = rounds
    .slice(0, n)
    .map(roundScore)
    .filter((s): s is RoundScore => s !== null)
    .reverse()
  return recent.map((s) => ({
    id: s.round.id,
    label: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
      new Date(s.round.date),
    ),
    vsPar18: Math.round(s.vsPar18 * 10) / 10,
  }))
}
