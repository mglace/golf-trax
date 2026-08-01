/**
 * The embedded sign-in modal (PHASE2.md §4, §7). Two steps, no redirect and no
 * Auth0-hosted page: enter your email → we email a code → type it back in. Any
 * `login()` call from the app opens this; on success it closes and the provider
 * flips to signed-in.
 *
 * Mobile-first: 48px targets, `type=email`/`inputmode=numeric`, and
 * `autocomplete=one-time-code` so phones offer to fill the emailed code.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { useDialogFocus } from '@/components/useDialogFocus'
import { SpinnerIcon, XIcon } from '@/components/icons'

interface SignInDialogProps {
  onClose: () => void
  /** Ask Auth0 to email a code (step 1). */
  onStart: (email: string) => Promise<void>
  /** Exchange the code for a session (step 2); resolves once signed in. */
  onVerify: (email: string, code: string) => Promise<void>
}

function messageOf(err: unknown): string {
  return err instanceof Error && err.message
    ? err.message
    : 'Something went wrong. Please try again.'
}

export function SignInDialog({ onClose, onStart, onVerify }: SignInDialogProps) {
  const dialogRef = useDialogFocus<HTMLDivElement>()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  async function submitEmail(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await onStart(email.trim())
      setStep('code')
      setCode('')
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await onVerify(email.trim(), code.trim())
      onClose() // Signed in — the provider takes over from here.
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={() => !busy && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to sync"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-base font-bold text-slate-900">Sign in to sync</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="-m-1 rounded-lg p-1 text-slate-400 active:bg-slate-100 disabled:opacity-40"
          >
            <XIcon className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {step === 'email' ? (
          <form onSubmit={submitEmail} className="mt-3">
            <p className="text-sm text-slate-500">
              Enter your email and we’ll send you a code — no password needed.
            </p>
            <label htmlFor="signin-email" className="mt-4 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="signin-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 min-h-[48px] w-full rounded-xl border border-slate-300 px-3 text-base text-slate-900 focus:border-fairway-600 focus:outline-none focus:ring-2 focus:ring-fairway-600/30"
            />
            {error && (
              <p className="mt-2 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || email.trim() === ''}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-fairway-700 px-4 font-semibold text-white active:bg-fairway-800 disabled:opacity-50"
            >
              {busy && <SpinnerIcon className="h-4 w-4" aria-hidden />}
              {busy ? 'Sending…' : 'Send me a code'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="mt-3">
            <p className="text-sm text-slate-500">
              We emailed a code to{' '}
              <span className="font-medium text-slate-700">{email.trim()}</span>. Enter it below.
            </p>
            <label htmlFor="signin-code" className="mt-4 block text-sm font-medium text-slate-700">
              Login code
            </label>
            <input
              id="signin-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="mt-1 min-h-[48px] w-full rounded-xl border border-slate-300 px-3 text-center text-lg tracking-[0.3em] text-slate-900 focus:border-fairway-600 focus:outline-none focus:ring-2 focus:ring-fairway-600/30"
            />
            {error && (
              <p className="mt-2 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || code.trim() === ''}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-fairway-700 px-4 font-semibold text-white active:bg-fairway-800 disabled:opacity-50"
            >
              {busy && <SpinnerIcon className="h-4 w-4" aria-hidden />}
              {busy ? 'Verifying…' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('email')
                setError(null)
              }}
              disabled={busy}
              className="mt-3 w-full text-center text-sm font-medium text-slate-500 active:text-slate-700 disabled:opacity-40"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
