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

export interface ScoringDistribution {
  /** Total holes with a score entered (the denominator for percentages). */
  total: number
  eagles: number // score − par ≤ −2 (incl. albatross)
  birdies: number // −1
  pars: number // E
  bogeys: number // +1
  doubles: number // +2
  triplesPlus: number // ≥ +3
  /** Scoring average by par type, for the par 3/4/5 the player has holes of. */
  byParType: { par: number; avgScore: number; avgVsPar: number; count: number }[]
}

/**
 * Distribution of hole results (eagle → triple+) and scoring average by par
 * type, across every scored hole in the given rounds.
 */
export function scoringDistribution(rounds: Round[]): ScoringDistribution {
  const dist: ScoringDistribution = {
    total: 0,
    eagles: 0,
    birdies: 0,
    pars: 0,
    bogeys: 0,
    doubles: 0,
    triplesPlus: 0,
    byParType: [],
  }
  const byPar = new Map<number, { score: number; vsPar: number; count: number }>()
  for (const r of rounds) {
    for (const h of r.holes) {
      if (h.score === undefined) continue
      dist.total += 1
      const vs = h.score - h.par
      if (vs <= -2) dist.eagles += 1
      else if (vs === -1) dist.birdies += 1
      else if (vs === 0) dist.pars += 1
      else if (vs === 1) dist.bogeys += 1
      else if (vs === 2) dist.doubles += 1
      else dist.triplesPlus += 1
      const cur = byPar.get(h.par) ?? { score: 0, vsPar: 0, count: 0 }
      cur.score += h.score
      cur.vsPar += vs
      cur.count += 1
      byPar.set(h.par, cur)
    }
  }
  dist.byParType = [...byPar.entries()]
    .sort(([a], [b]) => a - b)
    .map(([par, v]) => ({
      par,
      avgScore: v.score / v.count,
      avgVsPar: v.vsPar / v.count,
      count: v.count,
    }))
  return dist
}

export interface PuttingStats {
  /** Holes where putts were recorded (denominator for the rates below). */
  holesWithPutts: number
  /** % of putted holes that took 1 putt. */
  onePuttPct: number | null
  /** % of putted holes that took ≥ 3 putts. */
  threePuttPct: number | null
  /** Average putts on greens hit in regulation. */
  puttsPerGir: number | null
}

/** Putting depth: 1-putt %, 3-putt %, and putts-per-GIR across all holes. */
export function puttingStats(rounds: Round[]): PuttingStats {
  let holesWithPutts = 0
  let onePutts = 0
  let threePutts = 0
  let girPutts = 0
  let girHoles = 0
  for (const r of rounds) {
    for (const h of r.holes) {
      if (h.putts === undefined) continue
      holesWithPutts += 1
      if (h.putts === 1) onePutts += 1
      if (h.putts >= 3) threePutts += 1
      if (h.gir === true) {
        girPutts += h.putts
        girHoles += 1
      }
    }
  }
  return {
    holesWithPutts,
    onePuttPct: holesWithPutts > 0 ? (onePutts / holesWithPutts) * 100 : null,
    threePuttPct: holesWithPutts > 0 ? (threePutts / holesWithPutts) * 100 : null,
    puttsPerGir: girHoles > 0 ? girPutts / girHoles : null,
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
  courseId: string
  courseName: string
  count: number
  avgVsPar18: number | null
  best: RoundScore | null
}

/** Per-course averages, only for courses with at least `minRounds` rounds. */
export function courseBreakdown(rounds: Round[], minRounds = 5): CourseStat[] {
  const byCourse = new Map<string, Round[]>()
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

export interface TeeStat {
  teeName: string
  count: number
  avgVsPar18: number | null
  best: RoundScore | null
}

/** Per-tee averages, only for tees with at least `minRounds` rounds. */
export function teeBreakdown(rounds: Round[], minRounds = 3): TeeStat[] {
  const byTee = new Map<string, Round[]>()
  for (const r of rounds) {
    const list = byTee.get(r.teeName) ?? []
    list.push(r)
    byTee.set(r.teeName, list)
  }
  const stats: TeeStat[] = []
  for (const [teeName, list] of byTee) {
    if (list.length < minRounds) continue
    const summary = scoringSummary(list)
    stats.push({ teeName, count: list.length, avgVsPar18: summary.avgVsPar18, best: summary.best })
  }
  return stats.sort((a, b) => b.count - a.count)
}

export interface CourseOption {
  courseId: string
  courseName: string
  count: number
}

/**
 * Distinct courses across the given rounds, for the stats course filter.
 * Sorted by round count (most-played first), then name. The name shown is
 * from the most recent round for that course (rounds are newest-first).
 */
export function courseOptions(rounds: Round[]): CourseOption[] {
  const byCourse = new Map<string, { courseName: string; count: number }>()
  for (const r of rounds) {
    const cur = byCourse.get(r.courseId)
    if (cur) {
      cur.count += 1
    } else {
      byCourse.set(r.courseId, { courseName: r.courseName, count: 1 })
    }
  }
  return [...byCourse.entries()]
    .map(([courseId, v]) => ({ courseId, courseName: v.courseName, count: v.count }))
    .sort((a, b) => b.count - a.count || a.courseName.localeCompare(b.courseName))
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
