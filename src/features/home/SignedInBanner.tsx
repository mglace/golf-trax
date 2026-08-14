/**
 * One-time confirmation that the post-save sign-in landed.
 *
 * The cloud prompt (`features/onboarding/CloudPromptModal`) hands the user off
 * to Auth0's hosted login and they return to `/` — with no acknowledgement, the
 * round trip ends in silence and it's not obvious anything happened. This closes
 * that loop by reporting what the sync engine is doing with the rounds that were
 * just adopted into the account (PHASE2.md §6.4).
 *
 * Presentational only: it keys off a `pendingSignIn` flag set before the
 * redirect, and clears it once seen, so it shows once and never returns. Losing
 * the flag (e.g. the magic link opens in a different browser) costs nothing but
 * this message.
 */
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '@/auth/authContext'
import { getCloudPromptPrefs, clearPendingSignIn } from '@/db/prefsRepo'
import { countCompletedRounds } from '@/db/roundsRepo'
import { useSyncStore } from '@/sync/syncStore'
import { SpinnerIcon, XIcon } from '@/components/icons'

export function SignedInBanner() {
  const { isAuthenticated, email } = useAuth()
  const prefs = useLiveQuery(() => getCloudPromptPrefs(), [], undefined)
  const pending = prefs?.pendingSignIn === true
  // Gated on what actually decides visibility, and left without a default.
  //
  // Gated because `countCompletedRounds()` can't use an index for its tombstone
  // predicate, so it opens a value cursor and deserializes every completed round
  // with its full `holes` array — an unwelcome cost on the cold-start route, and
  // pure waste on a local-only build where this banner can never render.
  //
  // Undefaulted because the copy below quotes this number: the two live queries
  // resolve independently, so a default of 0 would let the banner render early
  // and announce "0 rounds" to someone who by construction has at least one.
  const roundCount = useLiveQuery(
    () => (isAuthenticated && pending ? countCompletedRounds() : undefined),
    [isAuthenticated, pending],
  )
  const status = useSyncStore((s) => s.status)

  const ready = isAuthenticated && pending && roundCount !== undefined

  // Latched at the moment of appearing, and rendered from the latch rather than
  // from `ready`. Two reasons:
  //
  //  - Clearing the flag flips `pending` false, which would otherwise make the
  //    confirmation vanish the instant it appeared. The count is captured too,
  //    since its query is gated on `pending` and stops resolving alongside it.
  //  - The clear happens on *appearance*, not in an effect cleanup. A
  //    cleanup-time clear silently assumes "cleanup means unmount", which React
  //    18 StrictMode disproves — it runs mount → cleanup → mount, so in dev the
  //    flag was being cleared the moment the banner first rendered. Clearing on
  //    appearance behaves identically under both, and a crash before unmount no
  //    longer leaves the flag set.
  const [shown, setShown] = useState<{ count: number } | null>(null)

  useEffect(() => {
    if (!ready || shown) return
    setShown({ count: roundCount })
    void clearPendingSignIn()
  }, [ready, shown, roundCount])

  // Drop it if the session ends underneath us — a stale "you're signed in"
  // banner is worse than none.
  if (!shown || !isAuthenticated) return null

  const rounds = shown.count === 1 ? '1 round' : `${shown.count} rounds`
  // Mirrors the STATUS_TEXT map in Settings → Account & sync, phrased around the
  // rounds the user just signed in to protect. 'signed-out' is the pre-handshake
  // state on a fresh load, not a contradiction — SyncManager sets the context a
  // tick later — so it reads as "starting", like 'syncing'.
  const detail =
    status === 'synced'
      ? // Verb agrees with the count: the first milestone is 1, so "1 round" is
        // the likeliest thing this banner ever says. The branches below read
        // correctly either way.
        `Your ${rounds} ${shown.count === 1 ? 'is' : 'are'} safe in the cloud.`
      : status === 'offline'
        ? `Your ${rounds} will sync when you reconnect.`
        : status === 'error'
          ? `We’ll keep trying to sync your ${rounds}.`
          : status === 'paused'
            ? `Sync is paused — open Settings to sign in again.`
            : `Syncing your ${rounds}…`
  const busy = status === 'syncing' || status === 'signed-out'

  return (
    <section
      aria-labelledby="signed-in-heading"
      className="mb-6 flex items-start gap-3 rounded-xl border border-fairway-200 bg-fairway-50/50 p-4"
    >
      <div className="min-w-0 flex-1">
        <p id="signed-in-heading" className="font-semibold text-slate-900">
          You’re signed in{email ? ` as ${email}` : ''}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600" aria-live="polite">
          {busy && <SpinnerIcon className="h-4 w-4 shrink-0" aria-hidden />}
          {detail}
        </p>
      </div>
      <button
        type="button"
        // Purely local now: the persisted flag was already cleared on appearance.
        onClick={() => setShown(null)}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 shrink-0 rounded-full p-2 text-slate-400 hover:bg-fairway-100"
      >
        <XIcon className="h-4 w-4" aria-hidden />
      </button>
    </section>
  )
}
