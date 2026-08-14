import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  getRound,
  finalizeRound,
  updateHoleInRound,
  countCompletedRounds,
} from '@/db/roundsRepo'
import {
  getCloudPromptPrefs,
  recordCloudPromptShown,
  dismissCloudPromptForever,
  setPendingSignIn,
  clearPendingSignIn,
} from '@/db/prefsRepo'
import { triggerSync } from '@/sync/controller'
import { useAuth } from '@/auth/authContext'
import { trackEvent } from '@/analytics/gtag'
import { computeTotals, ROUND_LENGTH_LABEL } from '@/domain/round'
import { shouldPromptForCloud, isRepeatCloudPrompt, canPromptForCloud } from '@/domain/cloudPrompt'
import { CloudPromptModal } from '@/features/onboarding/CloudPromptModal'
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
  const { isConfigured, isLoading, isAuthenticated, login } = useAuth()
  const [saving, setSaving] = useState(false)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  // Non-null while the post-save cloud prompt is up; carries what the copy needs.
  const [cloudPrompt, setCloudPrompt] = useState<{ count: number; repeat: boolean } | null>(
    null,
  )
  // Where the current prompt's sign-in hand-off has got to. Three states because
  // two different rules key off it with different lifetimes: analytics must
  // report at most one attempt per prompt (so `failed` never returns to `none`),
  // while the dismissal guard applies only while a redirect might still land (so
  // only `in-flight` suppresses).
  const signInStateRef = useRef<'none' | 'in-flight' | 'failed'>('none')
  // Latches the permanent opt-out. Unlike "Not now", that path awaits a Dexie
  // write before it clears state, so the button stays live and mounted across
  // the await — and a double-tap would report the opt-out twice, inflating the
  // one metric meant to reveal that this prompt is unwelcome.
  const dismissingRef = useRef(false)

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

    // Signed out on a sync-enabled build, this is the one moment the app has
    // something worth keeping to point at — offer the account here rather than
    // leaving sync discoverable only from Settings. The round is already saved,
    // so the prompt delays nothing but the navigation.
    //
    // Everything here is strictly optional relative to the save, so a Dexie
    // failure must degrade to the pre-prompt behaviour — plain navigation —
    // rather than reject out of the handler and strand the user on a summary
    // screen with `saving` stuck true and the button disabled.
    //
    // The auth gate is checked first because `countCompletedRounds()` is not
    // cheap (it deserializes every completed round — see its doc), and on a
    // local-only build or for a signed-in user the answer is always no, so
    // querying first would burn that cost on every save for nothing.
    try {
      if (!canPromptForCloud({ isConfigured, isLoading, isAuthenticated })) {
        navigate('/rounds')
        return
      }
      const [completedCount, prefs] = await Promise.all([
        countCompletedRounds(),
        getCloudPromptPrefs(),
      ])
      if (
        shouldPromptForCloud({ isConfigured, isLoading, isAuthenticated, completedCount, prefs })
      ) {
        // Record before rendering: a user who force-quits mid-prompt shouldn't be
        // asked again at the same milestone.
        await recordCloudPromptShown(completedCount)
        trackEvent('cloud_prompt_shown', { rounds_saved: completedCount })
        signInStateRef.current = 'none'
        dismissingRef.current = false
        setCloudPrompt({ count: completedCount, repeat: isRepeatCloudPrompt(prefs) })
        setSaving(false)
        return
      }
    } catch {
      /* prompt is optional — fall through to the navigation below */
    }

    navigate('/rounds')
  }

  // `is_permanent` separates "not now" from "don't ask again" — the opt-out rate
  // is the signal for whether this prompt is wearing out its welcome, and it's
  // invisible if both decline paths report identically.
  //
  // Escape and the backdrop stay live during the sign-in hand-off on purpose:
  // `loginWithRedirect` does async work before navigating, and on a flaky
  // connection — the norm for an app used on a course — that window is unbounded,
  // so disabling every exit could strand the user in a modal with no way out.
  // The cost of leaving them live is that a dismissal can land after a start was
  // already reported, which would count one prompt as both a conversion and a
  // decline; CLAUDE.md says this funnel is what the cadence gets tuned on, so
  // suppress the decline rather than the exit.
  function dismissCloudPrompt(permanent = false) {
    if (signInStateRef.current !== 'in-flight') {
      trackEvent('cloud_prompt_dismissed', {
        rounds_saved: cloudPrompt?.count ?? 0,
        is_permanent: permanent,
      })
    }
    setCloudPrompt(null)
    navigate('/rounds')
  }

  async function handleCloudPromptForever() {
    if (dismissingRef.current) return
    dismissingRef.current = true
    // Suppression is best-effort — if the write fails the next milestone simply
    // re-asks. What must not fail is the dismissal itself: tapping the permanent
    // opt-out and having the modal just sit there is the worst outcome for the
    // one control that exists to stop this prompt.
    try {
      await dismissCloudPromptForever()
    } catch {
      /* fall through — dismiss regardless */
    }
    dismissCloudPrompt(true)
  }

  async function handleCloudPromptSubmit(email: string) {
    // Flag the round-trip so Home can confirm the sign-in landed; a failure here
    // must not block the redirect, which is the actual point of the flow.
    try {
      await setPendingSignIn(true)
    } catch {
      /* presentation only — proceed to sign-in regardless */
    }
    // Once per prompt, not once per attempt: after a failed hand-off the user can
    // retry from the modal, and re-reporting would let one prompt's redirect rate
    // exceed its own impression. The event necessarily counts an attempt rather
    // than a confirmed redirect — on success the browser has navigated away
    // before we could observe it — which is how CLAUDE.md describes it.
    if (signInStateRef.current === 'none') {
      trackEvent('cloud_signin_started', { rounds_saved: cloudPrompt?.count ?? 0 })
    }
    signInStateRef.current = 'in-flight'
    try {
      // Leaves the app for Auth0's hosted login, pre-filled with this address.
      await login({ email })
    } catch (err) {
      // The redirect never started, so there is no pending conversion to protect
      // and the user is back in the modal: a decline from here is a real
      // decline, and must report as one. Only an *in-flight* hand-off suppresses
      // the dismissal.
      signInStateRef.current = 'failed'
      // Keep the persisted half of the hand-off state in step with the ref —
      // otherwise the flag survives, and a later unrelated sign-in from Settings
      // greets the user with a banner for a post-save sign-in that never landed.
      void clearPendingSignIn()
      // Rethrow — the modal needs this to clear its pending state and say so.
      throw err
    }
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

      {cloudPrompt && (
        <CloudPromptModal
          roundCount={cloudPrompt.count}
          showDontAskAgain={cloudPrompt.repeat}
          onSubmit={handleCloudPromptSubmit}
          onDismiss={() => dismissCloudPrompt()}
          onDismissForever={() => void handleCloudPromptForever()}
        />
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
