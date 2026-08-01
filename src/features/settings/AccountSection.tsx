/**
 * Settings → Account & sync (PHASE2.md §7). Renders only when sync is
 * configured for the build; otherwise the app stays a local-only MVP and this
 * section is absent entirely.
 *
 * Signed out → a one-tap "Sign in to sync across devices" that opens the
 * embedded passwordless email-code dialog (no Auth0-hosted page). Signed in →
 * the account email, a live sync-status line, and sign-out. Nothing here blocks
 * on the network (§7).
 */
import { useAuth } from '@/auth/authContext'
import { useSyncStore, type SyncStatus } from '@/sync/syncStore'
import { SpinnerIcon } from '@/components/icons'

const STATUS_TEXT: Record<SyncStatus, string> = {
  'signed-out': 'Sign in to sync across devices',
  syncing: 'Syncing…',
  synced: 'All changes synced',
  offline: 'Offline — will sync when you reconnect',
  paused: 'Sync paused — sign in again to resume',
  error: 'Couldn’t sync — will retry',
}

function StatusLine() {
  const status = useSyncStore((s) => s.status)
  const tone =
    status === 'error'
      ? 'text-red-600'
      : status === 'synced'
        ? 'text-fairway-700'
        : 'text-slate-500'
  return (
    <p className={`flex items-center gap-2 text-sm ${tone}`} aria-live="polite">
      {status === 'syncing' && <SpinnerIcon className="h-4 w-4" aria-hidden />}
      {STATUS_TEXT[status]}
    </p>
  )
}

export function AccountSection() {
  const { isConfigured, isLoading, isAuthenticated, email, login, logout } = useAuth()

  // Local-only build: no account surface at all.
  if (!isConfigured) return null

  // Sign-out cleanup (revoke the token, clear this device's account-owned
  // rounds so a shared device never leaks one account's synced data into the
  // next session — §11.5) lives in the provider's `logout`, which is shared with
  // the involuntary sign-out path. Local-only rounds are kept; account rounds
  // re-pull on next sign-in.

  return (
    <section
      aria-labelledby="account-heading"
      className="mt-6 rounded-2xl border border-slate-200 p-4"
    >
      <h2 id="account-heading" className="text-base font-semibold text-slate-900">
        Account &amp; sync
      </h2>

      {isLoading ? (
        <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
          <SpinnerIcon className="h-4 w-4" aria-hidden />
          Checking your session…
        </p>
      ) : isAuthenticated ? (
        <>
          <p className="mt-1 text-sm text-slate-500">
            Signed in{email ? ' as ' : ''}
            {email && <span className="font-medium text-slate-700">{email}</span>}. Your completed
            rounds sync across your devices.
          </p>
          <div className="mt-3">
            <StatusLine />
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 active:bg-slate-50"
          >
            Sign out
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-500">
            Sign in with just your email to sync your completed rounds across devices. You can keep
            using GolfTrax without an account — everything stays on this device.
          </p>
          <button
            type="button"
            onClick={login}
            className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-fairway-700 px-4 py-3 font-semibold text-white active:bg-fairway-800"
          >
            Sign in to sync
          </button>
        </>
      )}
    </section>
  )
}
