/**
 * "Save your rounds to the cloud?" — the post-save sign-in invitation.
 *
 * Shown after a round is finalized, at the milestones in
 * `domain/cloudPrompt.ts`, and only on sync-enabled builds when signed out. It
 * is an *invitation*, never a gate: the round is already saved to IndexedDB
 * before this renders, and "Not now" costs the user nothing (PHASE2.md §1, §2).
 *
 * Presentational — the parent owns persistence and the redirect, matching how
 * {@link ConfirmDialog} is used.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { useDialogFocus } from '@/components/useDialogFocus'

/**
 * Deliberately permissive: something@something.tld, no spaces. Auth0 is the real
 * authority on deliverability, so this only catches the obvious typo before we
 * spend a full redirect on it — a stricter pattern would reject valid addresses.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface CloudPromptModalProps {
  /** Completed rounds on this device — the concrete number in the pitch. */
  roundCount: number
  /** Whether to offer "Don't ask again" (withheld on the first ask). */
  showDontAskAgain: boolean
  /**
   * Submit: hand the address to the sign-in redirect. Rejecting means the
   * hand-off failed before the browser navigated, and the modal recovers.
   */
  onSubmit: (email: string) => Promise<void>
  /** "Not now" — dismiss and continue; the prompt may return at a later milestone. */
  onDismiss: () => void
  /** "Don't ask again" — dismiss and suppress the prompt for good. */
  onDismissForever: () => void
}

export function CloudPromptModal({
  roundCount,
  showDontAskAgain,
  onSubmit,
  onDismiss,
  onDismissForever,
}: CloudPromptModalProps) {
  const dialogRef = useDialogFocus<HTMLDivElement>()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  // Latched for the duration of the hand-off to stop a second tap. On success
  // the browser navigates away and it is never cleared; if the hand-off fails
  // it must be, or every control here — including both dismiss buttons — stays
  // disabled behind a spinner that never resolves.
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!EMAIL_RE.test(trimmed)) {
      setError('Enter a valid email address.')
      return
    }
    setError(undefined)
    setSubmitting(true)
    try {
      await onSubmit(trimmed)
    } catch {
      // The redirect never started — likely offline, which is common here since
      // the prompt fires the moment a round is saved, often out on a course.
      setSubmitting(false)
      setError('Couldn’t start sign-in. Check your connection and try again.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onDismiss}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-prompt-heading"
        className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="cloud-prompt-heading" className="text-base font-bold text-slate-900">
          Save your rounds to the cloud?
        </h2>
        <p className="mt-1.5 text-sm text-slate-500">
          Sign in with just your email to reach your{' '}
          {roundCount === 1 ? 'round' : `${roundCount} rounds`} from any device. We’ll email
          you a code to sign in — no password to remember.
        </p>

        {/*
          `noValidate` so this component owns validation rather than the browser:
          a native `type="email"` bubble would silently block submit, bypassing
          the `role="alert"` + `aria-describedby` wiring below, and it renders
          inconsistently across browsers. The input keeps `type="email"` for the
          right mobile keyboard and autofill.
        */}
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="mt-4">
          <label htmlFor="cloud-prompt-email" className="sr-only">
            Email address
          </label>
          <input
            id="cloud-prompt-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'cloud-prompt-error' : undefined}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-fairway-700 focus:outline-none focus:ring-1 focus:ring-fairway-700 disabled:opacity-50"
          />
          {error && (
            <p id="cloud-prompt-error" role="alert" className="mt-1.5 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onDismiss}
              disabled={submitting}
              className="min-h-[48px] flex-1 rounded-xl border border-slate-300 bg-white py-2.5 font-semibold text-slate-700 active:bg-slate-50 disabled:opacity-50"
            >
              Not now
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[48px] flex-1 rounded-xl bg-fairway-700 py-2.5 font-semibold text-white active:bg-fairway-800 disabled:opacity-50"
            >
              {/*
                "Continue", not "Send link": submitting hands off to Auth0's
                hosted screen, which — even pre-filled by `login_hint` — may still
                want a tap before it emails anything. This wording is accurate
                either way, and the body copy above carries the promise that a
                link is coming.
              */}
              {submitting ? 'Opening…' : 'Continue'}
            </button>
          </div>
        </form>

        <p className="mt-4 text-xs text-slate-500">
          You can keep using GolfTrax without an account — everything stays on this device.
        </p>

        {showDontAskAgain && (
          <button
            type="button"
            onClick={onDismissForever}
            disabled={submitting}
            className="mt-3 w-full text-xs font-medium text-slate-500 underline underline-offset-2 disabled:opacity-50"
          >
            Don’t ask again
          </button>
        )}
      </div>
    </div>
  )
}
