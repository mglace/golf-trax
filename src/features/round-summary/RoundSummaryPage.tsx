import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getRound, finalizeRound, updateHoleInRound } from '@/db/roundsRepo'
import { triggerSync } from '@/sync/controller'
import { trackEvent } from '@/analytics/gtag'
import { computeTotals, ROUND_LENGTH_LABEL } from '@/domain/round'
import { isShareable, shareHighlight } from '@/domain/shareCard'
import { ChevronLeftIcon, SpinnerIcon, ShareIcon, CheckIcon } from '@/components/icons'
import { StatsWidget } from './StatsWidget'
import { Scorecard } from './Scorecard'
import { NotesField } from './NotesField'
import { HoleEditSheet } from './HoleEditSheet'

// Code-split: the share flow is only reachable from a finished round, so the
// on-course entry path never downloads it (same reasoning as StatsPage).
const ShareSheet = lazy(() =>
  import('@/features/share/ShareSheet').then((m) => ({ default: m.ShareSheet })),
)

/**
 * Round Summary & Completion (Milestone 4): full scorecard, scoped stats,
 * per-hole editing (works before and after finalize), notes, and save.
 */
export function RoundSummaryPage() {
  const navigate = useNavigate()
  const { roundId } = useParams<{ roundId: string }>()
  const round = useLiveQuery(() => (roundId ? getRound(roundId) : undefined), [roundId])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  // Distinguishes "just finished this round" from "reopened it from history",
  // which look identical once the round is complete.
  const [justSaved, setJustSaved] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (round !== undefined) setLoaded(true)
  }, [round])

  const shareable = round ? isShareable(round) : false

  // Warm the share chunk as soon as a round is shareable, rather than waiting
  // for the tap. Signal on a course is exactly what disappears between opening
  // a round and deciding to share it, and a chunk that can't be fetched means
  // the sheet never opens at all — so the user would get silence instead of the
  // offline message the sheet exists to show. (In production the service worker
  // precaches this; the preload is what makes it hold in dev and on a cold SW.)
  useEffect(() => {
    if (shareable) void import('@/features/share/ShareSheet')
  }, [shareable])

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
  // Only fully-scored rounds can be shared — the card has no room to caveat a
  // half-played round. `[round]` is the history list; a full history would only
  // sharpen the badge wording, and loading it here would block first paint.
  const highlight = shareable ? shareHighlight(round, [round]) : null
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
    setSaveError(null)
    try {
      await finalizeRound(round.id)
    } catch (err) {
      // Without this the button stays disabled behind a spinner forever, with
      // no indication anything went wrong.
      console.error('Failed to finalize round', err)
      setSaveError('Could not save this round. Try again.')
      setSaving(false)
      return
    }
    // Non-identifying aggregate metrics only — no opaque round/course ids reach
    // GA (mirrors the route-pattern sanitization in analytics/gtag.ts).
    // Saving a partially-scored round is supported (see the amber banner), so
    // total_score/vs_par only reflect the holes actually entered; holes_entered
    // and is_complete travel alongside so partial rounds stay separable in GA4.
    trackEvent('round_completed', {
      round_length: round.roundLength,
      hole_count: round.holes.length,
      holes_entered: totals.holesEntered,
      is_complete: totals.isComplete,
      total_score: totals.totalScore,
      vs_par: totals.vsPar,
    })
    // Best-effort: push the finalized round now if signed in (no-op otherwise).
    triggerSync()
    // Deliberately NOT navigating away. `useLiveQuery` re-renders this page in
    // its completed state, which turns the moment the round is finished — the
    // point of peak pride, and the only moment anyone would want to post about
    // — into something the user can act on, instead of ejecting them to a list.
    setSaving(false)
    setJustSaved(true)
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10">
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

      {/* Saved confirmation. Occupies the same slot as the amber partial-round
          banner above, which is the page's established "state callout" position.
          The share CTA only appears for a round worth bragging about — prompting
          on every round trains people to dismiss it, and asks them to broadcast
          rounds they aren't proud of. */}
      {justSaved && isComplete && (
        <div className="mt-4 rounded-xl border border-fairway-200 bg-fairway-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-fairway-800">
            <CheckIcon className="h-5 w-5" aria-hidden />
            Round saved
          </p>
          {highlight ? (
            <>
              <p className="mt-1 text-sm text-fairway-900">{highlight.text}. Worth sharing?</p>
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-fairway-700 px-4 py-3 font-semibold text-white active:bg-fairway-800"
              >
                <ShareIcon className="h-5 w-5" aria-hidden />
                Share this round
              </button>
            </>
          ) : (
            <p className="mt-1 text-sm text-fairway-900">
              Your stats are updated. Nice work getting it logged.
            </p>
          )}
        </div>
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
          <>
            <button
              type="button"
              onClick={() => navigate('/rounds')}
              className="w-full rounded-2xl bg-fairway-700 px-4 py-4 text-lg font-semibold text-white shadow-sm active:bg-fairway-800"
            >
              Done
            </button>
            {/* Always available on a completed round, so any old round opened
                from history can be shared too — not just the one just saved. */}
            {shareable && (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 shadow-sm active:bg-slate-50"
              >
                <ShareIcon className="h-5 w-5" aria-hidden />
                Share
              </button>
            )}
          </>
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
            {saveError && (
              <p className="text-center text-sm text-red-600" role="alert">
                {saveError}
              </p>
            )}
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

      {shareOpen && (
        <Suspense fallback={null}>
          <ShareSheet round={round} onClose={() => setShareOpen(false)} />
        </Suspense>
      )}

      {editIndex !== null && round.holes[editIndex] && (
        <HoleEditSheet
          hole={round.holes[editIndex]}
          index={editIndex}
          onChange={(patch) => void updateHoleInRound(round.id, editIndex, patch)}
          onClose={() => setEditIndex(null)}
        />
      )}
    </main>
  )
}
