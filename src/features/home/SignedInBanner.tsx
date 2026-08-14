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
import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '@/auth/authContext'
import { getCloudPromptPrefs, setPendingSignIn } from '@/db/prefsRepo'
import { countCompletedRounds } from '@/db/roundsRepo'
import { useSyncStore } from '@/sync/syncStore'
import { SpinnerIcon, XIcon } from '@/components/icons'

export function SignedInBanner() {
  const { isAuthenticated, email } = useAuth()
  const prefs = useLiveQuery(() => getCloudPromptPrefs(), [], undefined)
  // No default: the copy quotes this number, and the two live queries resolve
  // independently. Defaulting to 0 would let the banner render before the count
  // arrives and announce "Your 0 rounds are safe in the cloud." to someone who
  // by construction has at least one — the prompt can't fire at zero rounds.
  const roundCount = useLiveQuery(() => countCompletedRounds(), [])
  const status = useSyncStore((s) => s.status)

  const visible =
    isAuthenticated && prefs?.pendingSignIn === true && roundCount !== undefined

  // Clear the flag once the banner goes away — dismissed, or simply navigated
  // past. Either way it has been seen, so it shouldn't greet them again.
  useEffect(() => {
    if (!visible) return
    return () => {
      void setPendingSignIn(false)
    }
  }, [visible])

  if (!visible) return null

  const rounds = roundCount === 1 ? '1 round' : `${roundCount} rounds`
  // Mirrors the STATUS_TEXT map in Settings → Account & sync, phrased around the
  // rounds the user just signed in to protect. 'signed-out' is the pre-handshake
  // state on a fresh load, not a contradiction — SyncManager sets the context a
  // tick later — so it reads as "starting", like 'syncing'.
  const detail =
    status === 'synced'
      ? `Your ${rounds} are safe in the cloud.`
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
        onClick={() => void setPendingSignIn(false)}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 shrink-0 rounded-full p-2 text-slate-400 hover:bg-fairway-100"
      >
        <XIcon className="h-4 w-4" aria-hidden />
      </button>
    </section>
  )
}
