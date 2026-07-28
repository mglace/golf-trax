import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getRound, finalizeRound, updateHoleInRound } from '@/db/roundsRepo'
import { computeTotals, ROUND_LENGTH_LABEL } from '@/domain/round'
import { ChevronLeftIcon, SpinnerIcon } from '@/components/icons'
import { StatsWidget } from './StatsWidget'
import { Scorecard } from './Scorecard'
import { NotesField } from './NotesField'
import { HoleEditSheet } from './HoleEditSheet'

/**
 * Round Summary & Completion (Milestone 4): full scorecard, scoped stats,
 * per-hole editing (works before and after finalize), notes, and save.
 */
export function RoundSummaryPage() {
  const navigate = useNavigate()
  const { roundId } = useParams<{ roundId: string }>()
  const round = useLiveQuery(() => (roundId ? getRound(roundId) : undefined), [roundId])
  const [saving, setSaving] = useState(false)
  const [editIndex, setEditIndex] = useState<number | null>(null)

  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (round !== undefined) setLoaded(true)
  }, [round])

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-slate-500">
        <SpinnerIcon className="h-6 w-6" aria-hidden />
        <span className="text-sm">Loading…</span>
      </div>
    )
  }

  if (!round) {
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

  const totals = computeTotals(round.holes)
  const isComplete = round.status === 'complete'
  const vsParLabel =
    totals.vsPar === 0 ? 'E' : totals.vsPar > 0 ? `+${totals.vsPar}` : `${totals.vsPar}`
  const playedDate = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(round.date))

  async function handleSave() {
    if (!round) return
    setSaving(true)
    await finalizeRound(round.id)
    navigate('/rounds')
  }

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-10">
      <header className="pt-safe flex items-center justify-between gap-1 pt-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate(isComplete ? '/rounds' : `/round/${round.id}`)}
            aria-label="Back"
            className="-ml-2 rounded-full p-2 text-slate-500 hover:bg-slate-100"
          >
            <ChevronLeftIcon className="h-6 w-6" aria-hidden />
          </button>
          <h1 className="text-xl font-bold tracking-tight">
            {isComplete ? 'Round' : 'Round summary'}
          </h1>
        </div>
      </header>

      {/* Hero */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
        <p className="text-sm font-semibold text-slate-900">{round.courseName}</p>
        <p className="text-xs text-slate-500">
          {round.teeName} · {ROUND_LENGTH_LABEL[round.roundLength]} · {playedDate}
        </p>
        <div className="mt-4 flex items-center justify-center gap-10">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Score</p>
            <p className="text-4xl font-bold tabular-nums text-slate-900">{totals.totalScore}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">vs Par</p>
            <p className="text-4xl font-bold tabular-nums text-fairway-700">{vsParLabel}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {totals.isComplete
            ? `${totals.holesTotal} holes · par ${totals.totalPar}`
            : `${totals.holesEntered} of ${totals.holesTotal} holes entered`}
        </p>
      </div>

      {!totals.isComplete && !isComplete && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Some holes don’t have a score yet. You can still save — stats use only the holes you’ve
          entered — or tap a hole below to fill it in.
        </p>
      )}

      <div className="mt-5 space-y-5">
        <section aria-label="Round statistics">
          <StatsWidget holes={round.holes} />
        </section>

        <section aria-label="Scorecard">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-600">Scorecard</h2>
            <span className="text-xs text-slate-500">Tap a score to edit</span>
          </div>
          <Scorecard
            holes={round.holes}
            roundLength={round.roundLength}
            onEditHole={setEditIndex}
          />
        </section>

        <section aria-label="Notes">
          <NotesField roundId={round.id} initialNotes={round.notes ?? ''} />
        </section>
      </div>

      {/* Actions */}
      <div className="mt-8 space-y-2">
        {isComplete ? (
          <button
            type="button"
            onClick={() => navigate('/rounds')}
            className="w-full rounded-2xl bg-fairway-700 px-4 py-4 text-lg font-semibold text-white shadow-sm active:bg-fairway-800"
          >
            Done
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-fairway-700 px-4 py-4 text-lg font-semibold text-white shadow-sm active:bg-fairway-800 disabled:opacity-50"
            >
              {saving && <SpinnerIcon className="h-5 w-5" aria-hidden />}
              Save round
            </button>
            <button
              type="button"
              onClick={() => navigate(`/round/${round.id}`)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 shadow-sm"
            >
              Back to editing
            </button>
          </>
        )}
      </div>

      {editIndex !== null && round.holes[editIndex] && (
        <HoleEditSheet
          hole={round.holes[editIndex]}
          index={editIndex}
          onChange={(patch) => void updateHoleInRound(round.id, editIndex, patch)}
          onClose={() => setEditIndex(null)}
        />
      )}
    </div>
  )
}
