import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useActiveRound } from '@/store/activeRound'
import { Numpad } from './Numpad'
import { HoleExtras } from './HoleExtras'
import { ChevronLeftIcon, ChevronRightIcon, SpinnerIcon } from '@/components/icons'
import { ROUND_LENGTH_LABEL, computeTotals } from '@/domain/round'

/**
 * Round Entry (Milestone 3) — the core on-course flow. Full-screen, hole by
 * hole: numpad score entry, optional fairway/putts, auto GIR, and prev/next
 * navigation. Every change auto-saves the draft.
 */
export function RoundEntryPage() {
  const navigate = useNavigate()
  const { roundId } = useParams<{ roundId: string }>()
  const { round, status, currentIndex, load, setCurrentIndex, patchHole } = useActiveRound()

  useEffect(() => {
    if (roundId) void load(roundId)
  }, [roundId, load])

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-slate-500">
        <SpinnerIcon className="h-6 w-6" aria-hidden />
        <span className="text-sm">Loading round…</span>
      </div>
    )
  }

  if (status === 'not-found' || !round) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-slate-600">That round could not be found.</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-xl bg-fairway-700 px-4 py-2 font-semibold text-white"
        >
          Go home
        </button>
      </div>
    )
  }

  const holes = round.holes
  const hole = holes[currentIndex]
  const totals = computeTotals(holes)
  const isFirst = currentIndex === 0
  const isLast = currentIndex === holes.length - 1
  const vsParLabel = totals.vsPar === 0 ? 'E' : totals.vsPar > 0 ? `+${totals.vsPar}` : `${totals.vsPar}`
  const scoredLabel =
    totals.holesEntered > 0 ? `${vsParLabel} · thru ${totals.holesEntered}` : 'No scores yet'

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4">
      {/* Header */}
      <header className="pt-safe sticky top-0 z-10 -mx-4 bg-slate-50/95 px-4 pb-2 pt-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Save & exit"
            className="-ml-2 rounded-full p-2 text-slate-500 hover:bg-slate-100"
          >
            <ChevronLeftIcon className="h-6 w-6" aria-hidden />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-sm font-semibold text-slate-900">{round.courseName}</h1>
            <p className="truncate text-xs text-slate-500">
              {round.teeName} · {ROUND_LENGTH_LABEL[round.roundLength]}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/round/${round.id}/summary`)}
            className="rounded-lg bg-fairway-700 px-3 py-1.5 text-sm font-semibold text-white active:bg-fairway-800"
          >
            Finish
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs font-medium text-slate-500">
          <span aria-live="polite" aria-atomic="true">
            Hole {hole.holeNumber} · {currentIndex + 1} of {holes.length}
          </span>
          <span className="tabular-nums">{scoredLabel}</span>
        </div>
      </header>

      {/* Hole context */}
      <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Hole</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900">{hole.holeNumber}</p>
        </div>
        <Stat label="Par" value={hole.par} />
        <Stat label="Yards" value={hole.yardage.toLocaleString()} />
        <Stat label="S.I." value={hole.handicap} />
      </div>

      {/* Score entry */}
      <div className="mt-4">
        <Numpad
          key={currentIndex}
          value={hole.score}
          par={hole.par}
          onChange={(score) => patchHole(currentIndex, { score })}
        />
      </div>

      {/* Fairway / putts / GIR */}
      <div className="mt-5">
        <HoleExtras hole={hole} onChange={(patch) => patchHole(currentIndex, patch)} />
      </div>

      {/* Navigation */}
      <div className="mt-auto" />
      <nav
        aria-label="Hole navigation"
        className="pb-safe sticky bottom-0 -mx-4 mt-6 flex gap-3 bg-slate-50/95 px-4 pb-3 pt-2 backdrop-blur"
      >
        <button
          type="button"
          onClick={() => setCurrentIndex(currentIndex - 1)}
          disabled={isFirst}
          className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white py-3 font-semibold text-slate-700 shadow-sm disabled:opacity-40"
        >
          <ChevronLeftIcon className="h-5 w-5" aria-hidden />
          Prev
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={() => navigate(`/round/${round.id}/summary`)}
            className="flex flex-[1.4] items-center justify-center gap-1 rounded-xl bg-fairway-700 py-3 font-semibold text-white shadow-sm active:bg-fairway-800"
          >
            Review &amp; Finish
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCurrentIndex(currentIndex + 1)}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white py-3 font-semibold text-slate-700 shadow-sm"
          >
            Next
            <ChevronRightIcon className="h-5 w-5" aria-hidden />
          </button>
        )}
      </nav>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-slate-800">{value}</p>
    </div>
  )
}
