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
  scoringDistribution,
  puttingStats,
  teeBreakdown,
  type StatsWindow,
  type RoundScore,
  type ScoringDistribution,
} from '@/domain/stats'
import { whsIndex } from '@/domain/handicap'
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

/** Format a WHS Handicap Index: "12.4", or "+2.1" for a plus handicap. */
function fmtIndex(v: number): string {
  return v < 0 ? `+${Math.abs(v).toFixed(1)}` : v.toFixed(1)
}

function fmtPct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v)}%`
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
  // Counts shown in the selector use scored rounds so they match every other
  // count on the page (hero, "By course"), which all exclude unscored rounds.
  const scoreableAll = allRounds ? allRounds.filter(isScoreable) : []
  const scoredByCourse = new Map(courseOptions(scoreableAll).map((c) => [c.courseId, c.count]))
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
  // Official WHS index when enough rated 18-hole rounds exist; else the estimate.
  const whs = whsIndex(scoreable)
  const handicap = handicapEstimate(scoreable) // always last 10 by definition
  const trend = trendSeries(scoreable, 10)
  const courses = courseBreakdown(scoreable, 5)
  const tees = teeBreakdown(scoreable, 3)

  // Per-hole stats are valid for any played hole, so they use every (filtered) round.
  const play = playSummary(windowRounds(rounds, window))
  const distribution = scoringDistribution(windowRounds(rounds, window))
  const putting = puttingStats(windowRounds(rounds, window))
  const difficulty = holeDifficulty(rounds)
  const hardest = difficulty.slice(0, 3)
  const easiest = [...difficulty].reverse().slice(0, 3)

  return (
    <div className="py-6">
      {/* Course filter — also shown while a filter is active even if only one
          course now has rounds, so there's always a control to clear it. */}
      {(courseChoices.length > 1 || courseScoped) && (
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
            <option value="">All courses ({scoreableAll.length})</option>
            {courseChoices.map((c) => (
              <option key={c.courseId} value={c.courseId}>
                {c.courseName} ({scoredByCourse.get(c.courseId) ?? 0})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Handicap hero: official WHS index when enough rated 18-hole rounds
          exist, otherwise the rough estimate. */}
      <div className="rounded-2xl border border-fairway-200 bg-fairway-50/60 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-fairway-700">
              {whs ? 'Handicap Index' : 'Est. Handicap'}
            </p>
            <p className="mt-1 text-4xl font-bold tabular-nums text-fairway-800">
              {whs ? fmtIndex(whs.value) : handicap ? fmtVsPar(handicap.value) : '—'}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p className="font-semibold text-slate-700">
              {whs ? whs.ratedRoundCount : scoreable.length}{' '}
              {(whs ? whs.ratedRoundCount : scoreable.length) === 1 ? 'round' : 'rounds'}
            </p>
            <p>{whs ? 'rated' : 'scored'}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {whs ? (
            <>
              Official WHS index — best {whs.differentialsUsed} of your last {whs.ratedRoundCount}{' '}
              rated 18-hole {whs.ratedRoundCount === 1 ? 'round' : 'rounds'}
              {courseScoped ? ' at this course' : ''}.
            </>
          ) : (
            <>
              Rough estimate from your last {handicap?.sampleSize ?? 0}{' '}
              {handicap?.sampleSize === 1 ? 'round' : 'rounds'}
              {courseScoped ? ' at this course' : ''} (18-hole equivalent vs par). Not an official
              USGA handicap.
            </>
          )}
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
            sub={courseScoped ? 'this course' : window === 'all' ? 'all-time' : `last ${window}`}
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
          <Tile label="Fairways" value={fmtPct(play.fairwayPct)} sub="hit" />
          <Tile label="GIR" value={fmtPct(play.girPct)} sub="greens" />
          <Tile label="Putts" value={play.avgPutts === null ? '—' : play.avgPutts.toFixed(1)} sub="per hole" />
        </div>
      </section>

      {/* Putting depth */}
      <section className="mt-2" aria-label="Putting">
        <div className="grid grid-cols-3 gap-2">
          <Tile label="1-putts" value={fmtPct(putting.onePuttPct)} sub="of holes" />
          <Tile label="3-putts" value={fmtPct(putting.threePuttPct)} sub="of holes" />
          <Tile
            label="Putts/GIR"
            value={putting.puttsPerGir === null ? '—' : putting.puttsPerGir.toFixed(2)}
            sub="greens hit"
          />
        </div>
      </section>

      {/* Scoring distribution */}
      {distribution.total > 0 && (
        <section className="mt-6" aria-label="Scoring distribution">
          <h2 className="mb-2 text-sm font-semibold text-slate-600">Scoring</h2>
          <ScoringBar dist={distribution} />
          {distribution.byParType.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {distribution.byParType.map((p) => (
                <Tile
                  key={p.par}
                  label={`Par ${p.par}`}
                  value={fmtVsPar(p.avgVsPar)}
                  sub={`avg ${p.avgScore.toFixed(1)}`}
                />
              ))}
            </div>
          )}
        </section>
      )}

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

      {/* By tee */}
      {tees.length > 0 && (
        <section className="mt-6" aria-label="By tee">
          <h2 className="mb-2 text-sm font-semibold text-slate-600">By tee</h2>
          <ul className="space-y-2">
            {tees.map((t) => (
              <li
                key={t.teeName}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{t.teeName}</p>
                  <p className="text-xs text-slate-500">{t.count} scored</p>
                </div>
                <p className="shrink-0 text-lg font-bold tabular-nums text-fairway-700">
                  {fmtVsPar(t.avgVsPar18)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Stacked bar of hole results (birdie-or-better → triple+) with a legend. */
function ScoringBar({ dist }: { dist: ScoringDistribution }) {
  const segs = [
    { label: 'Birdie+', count: dist.eagles + dist.birdies, cls: 'bg-fairway-600' },
    { label: 'Par', count: dist.pars, cls: 'bg-fairway-300' },
    { label: 'Bogey', count: dist.bogeys, cls: 'bg-amber-400' },
    { label: 'Double', count: dist.doubles, cls: 'bg-amber-600' },
    { label: 'Triple+', count: dist.triplesPlus, cls: 'bg-red-500' },
  ].filter((s) => s.count > 0)
  return (
    <div>
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-slate-100">
        {segs.map((s) => (
          <div
            key={s.label}
            className={s.cls}
            style={{ width: `${(s.count / dist.total) * 100}%` }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
        {segs.map((s) => (
          <li key={s.label} className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.cls}`} aria-hidden />
            {s.label} {Math.round((s.count / dist.total) * 100)}%
          </li>
        ))}
      </ul>
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
