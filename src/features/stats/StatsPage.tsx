import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getCompletedRounds } from '@/db/roundsRepo'
import {
  scoringSummary,
  handicapEstimate,
  playSummary,
  holeDifficulty,
  courseBreakdown,
  courseOptions,
  trendSeries,
  windowRounds,
  isScoreable,
  type StatsWindow,
  type RoundScore,
} from '@/domain/stats'
import { ROUND_LENGTH_LABEL } from '@/domain/round'
import { TrendChart } from './TrendChart'
import { ChartIcon, SpinnerIcon } from '@/components/icons'

/** Format a normalized (possibly fractional) score-to-par: "E", "+5.4", "-1.2". */
function fmtVsPar(v: number | null, digits = 1): string {
  if (v === null) return '—'
  if (Math.abs(v) < 0.05) return 'E'
  const n = v.toFixed(digits)
  return v > 0 ? `+${n}` : n
}

const WINDOWS: { key: StatsWindow; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 10, label: 'Last 10' },
  { key: 50, label: 'Last 50' },
]

export function StatsPage() {
  const navigate = useNavigate()
  const allRounds = useLiveQuery(() => getCompletedRounds(), [])
  const [window, setWindow] = useState<StatsWindow>('all')
  // null = no course filter. A real courseId is an opaque slug, so keeping the
  // "all" case out of that value space avoids any collision with an id.
  const [courseId, setCourseId] = useState<string | null>(null)

  // Distinct courses for the filter, derived from every completed round so the
  // selector stays stable regardless of the current window/course selection.
  const courseChoices = allRounds ? courseOptions(allRounds) : []
  const selectionValid = courseId !== null && courseChoices.some((c) => c.courseId === courseId)
  // If the selected course disappears (e.g. its rounds were deleted on another
  // device and synced away), clear the filter so it can't silently re-apply if
  // that course later returns while the page stays mounted.
  useEffect(() => {
    if (courseId !== null && !selectionValid) setCourseId(null)
  }, [courseId, selectionValid])

  if (allRounds === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
        <SpinnerIcon className="h-6 w-6" aria-hidden />
        <span className="text-sm">Loading stats…</span>
      </div>
    )
  }

  if (allRounds.length === 0) {
    return (
      <div className="py-6">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">Stats</h1>
        <div className="mt-10 flex flex-col items-center gap-3 text-center text-slate-500">
          <ChartIcon className="h-10 w-10" aria-hidden />
          <p className="text-sm">Log a few rounds and your stats will appear here.</p>
        </div>
      </div>
    )
  }

  // Mask a stale selection for this render; the effect above also clears it.
  const activeCourseId = selectionValid ? courseId : null
  const courseScoped = activeCourseId !== null
  const rounds = courseScoped ? allRounds.filter((r) => r.courseId === activeCourseId) : allRounds

  // Per-round metrics only count fully-entered rounds (see isScoreable).
  const scoreable = rounds.filter(isScoreable)
  const excluded = rounds.length - scoreable.length

  const summary = scoringSummary(windowRounds(scoreable, window))
  const handicap = handicapEstimate(scoreable) // always last 10 by definition
  const trend = trendSeries(scoreable, 10)
  const courses = courseBreakdown(scoreable, 5)

  // Per-hole stats are valid for any played hole, so they use every (filtered) round.
  const play = playSummary(windowRounds(rounds, window))
  const difficulty = holeDifficulty(rounds)
  const hardest = difficulty.slice(0, 3)
  const easiest = [...difficulty].reverse().slice(0, 3)

  return (
    <div className="py-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Stats</h1>

      {/* Course filter */}
      {courseChoices.length > 1 && (
        <div className="mb-4">
          <label htmlFor="stats-course-filter" className="sr-only">
            Filter by course
          </label>
          <select
            id="stats-course-filter"
            value={activeCourseId ?? ''}
            onChange={(e) => setCourseId(e.target.value || null)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base font-semibold text-slate-900 shadow-sm focus:border-fairway-500 focus:outline-none focus:ring-2 focus:ring-fairway-200"
          >
            <option value="">All courses ({allRounds.length})</option>
            {courseChoices.map((c) => (
              <option key={c.courseId} value={c.courseId}>
                {c.courseName} ({c.count})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Handicap estimate hero */}
      <div className="rounded-2xl border border-fairway-200 bg-fairway-50/60 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-fairway-700">
              Est. Handicap
            </p>
            <p className="mt-1 text-4xl font-bold tabular-nums text-fairway-800">
              {handicap ? fmtVsPar(handicap.value) : '—'}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p className="font-semibold text-slate-700">
              {scoreable.length} {scoreable.length === 1 ? 'round' : 'rounds'}
            </p>
            <p>scored</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Rough estimate from your last {handicap?.sampleSize ?? 0}{' '}
          {handicap?.sampleSize === 1 ? 'round' : 'rounds'}
          {courseScoped ? ' at this course' : ''} (18-hole equivalent vs par). Not an official USGA
          handicap.
        </p>
        {excluded > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            {excluded} round{excluded > 1 ? 's' : ''} with missing hole scores{' '}
            {excluded > 1 ? 'are' : 'is'} not included in scoring averages.
          </p>
        )}
      </div>

      {/* Window selector */}
      <div
        className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
        role="group"
        aria-label="Averaging window"
      >
        {WINDOWS.map((w) => (
          <button
            key={String(w.key)}
            type="button"
            aria-pressed={window === w.key}
            onClick={() => setWindow(w.key)}
            className={[
              'rounded-lg py-2 text-sm font-semibold transition-colors',
              window === w.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
            ].join(' ')}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* Scoring averages */}
      <section className="mt-4" aria-label="Scoring averages">
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Avg score" value={summary.avgScore18 === null ? '—' : summary.avgScore18.toFixed(1)} sub="per 18" />
          <Tile label="Avg vs par" value={fmtVsPar(summary.avgVsPar18)} sub="per 18" />
          <Tile
            label="Rounds"
            value={String(summary.count)}
            sub={window === 'all' ? (courseScoped ? 'this course' : 'all-time') : `last ${window}`}
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <RoundTile label="Best" score={summary.best} onOpen={(id) => navigate(`/round/${id}/summary`)} />
          <RoundTile label="Worst" score={summary.worst} onOpen={(id) => navigate(`/round/${id}/summary`)} />
        </div>
      </section>

      {/* Play stats */}
      <section className="mt-4" aria-label="Play statistics">
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Fairways" value={play.fairwayPct === null ? '—' : `${Math.round(play.fairwayPct)}%`} sub="hit" />
          <Tile label="GIR" value={play.girPct === null ? '—' : `${Math.round(play.girPct)}%`} sub="greens" />
          <Tile label="Putts" value={play.avgPutts === null ? '—' : play.avgPutts.toFixed(1)} sub="per hole" />
        </div>
      </section>

      {/* Trend */}
      <section className="mt-6" aria-label="Score trend">
        <h2 className="mb-1 text-sm font-semibold text-slate-600">Score trend</h2>
        {trend.length >= 2 ? (
          <>
            <TrendChart data={trend} />
            <p className="mt-1 text-center text-xs text-slate-500">
              Last {trend.length} rounds · vs par per 18 · lower is better
            </p>
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
            Play at least 2 rounds to see your trend.
          </p>
        )}
      </section>

      {/* Hole difficulty */}
      {difficulty.length > 0 && (
        <section className="mt-6" aria-label="Hole difficulty">
          <div className="grid grid-cols-2 gap-3">
            <HoleList title="Toughest holes" holes={hardest} />
            <HoleList title="Easiest holes" holes={easiest} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Average score vs par by hole, {courseScoped ? 'for this course' : 'across all courses'}.
          </p>
        </section>
      )}

      {/* By course (redundant once a single course is selected) */}
      {!courseScoped && courses.length > 0 && (
        <section className="mt-6" aria-label="By course">
          <h2 className="mb-2 text-sm font-semibold text-slate-600">By course</h2>
          <ul className="space-y-2">
            {courses.map((c) => (
              <li
                key={c.courseId}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{c.courseName}</p>
                  <p className="text-xs text-slate-500">{c.count} scored</p>
                </div>
                <p className="shrink-0 text-lg font-bold tabular-nums text-fairway-700">
                  {fmtVsPar(c.avgVsPar18)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

function RoundTile({
  label,
  score,
  onOpen,
}: {
  label: string
  score: RoundScore | null
  onOpen: (id: string) => void
}) {
  if (!score) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-300">—</p>
      </div>
    )
  }
  const vs = score.vsPar18
  const vsLabel = Math.abs(vs) < 0.05 ? 'E' : vs > 0 ? `+${vs.toFixed(1)}` : vs.toFixed(1)
  return (
    <button
      type="button"
      onClick={() => onOpen(score.round.id)}
      className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm active:bg-slate-50"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-fairway-700">{vsLabel}</p>
      <p className="truncate text-xs text-slate-500">
        {score.round.courseName} · {ROUND_LENGTH_LABEL[score.round.roundLength]}
      </p>
    </button>
  )
}

function HoleList({ title, holes }: { title: string; holes: { holeNumber: number; avgVsPar: number }[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="space-y-1.5">
        {holes.map((h) => {
          const v = h.avgVsPar
          const label = Math.abs(v) < 0.05 ? 'E' : v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)
          return (
            <li key={h.holeNumber} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Hole {h.holeNumber}</span>
              <span
                className={`font-semibold tabular-nums ${v > 0 ? 'text-amber-700' : v < 0 ? 'text-fairway-700' : 'text-slate-500'}`}
              >
                {label}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
