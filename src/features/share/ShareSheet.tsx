import { useEffect, useState } from 'react'
import type { Round } from '@/db/types'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useDialogFocus } from '@/components/useDialogFocus'
import { XIcon, ShareIcon, LinkIcon, CheckIcon, SpinnerIcon, WifiOffIcon } from '@/components/icons'
import { useShare, shareLink } from './useShare'

interface ShareSheetProps {
  round: Round
  onClose: () => void
}

type Notice = { kind: 'none' } | { kind: 'ok'; message: string } | { kind: 'bad'; message: string }

/**
 * Bottom sheet for sharing a finished round.
 *
 * Shows the SERVER-rendered card rather than drawing its own preview, so what
 * the user approves here is byte-identical to what a social crawler will show.
 *
 * Hand-rolled to match `HoleEditSheet` — there is no modal primitive in this
 * codebase, only the shared `useDialogFocus` hook, which is the part that
 * actually matters (focus trap + restore).
 */
export function ShareSheet({ round, onClose }: ShareSheetProps) {
  const sheetRef = useDialogFocus<HTMLDivElement>()
  const online = useOnlineStatus()
  const { state, publish } = useShare(round)
  const [notice, setNotice] = useState<Notice>({ kind: 'none' })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Create the link as soon as the sheet opens, but never while offline — the
  // request would just fail and the honest message is more useful than a spinner.
  useEffect(() => {
    if (online) void publish()
  }, [online, publish])

  async function onShare() {
    if (state.kind !== 'ready') return
    const result = await shareLink(round, state.url)
    if (result === 'copied') setNotice({ kind: 'ok', message: 'Link copied to clipboard.' })
    else if (result === 'failed') setNotice({ kind: 'bad', message: 'Could not copy the link.' })
    else setNotice({ kind: 'none' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Share this round"
        className="pb-safe max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-slate-50 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-lg font-bold text-slate-900">Share your round</p>
            <p className="text-xs text-slate-500">
              Anyone with the link can see this card. No personal details are included.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-slate-500 hover:bg-slate-200"
          >
            <XIcon className="h-6 w-6" aria-hidden />
          </button>
        </div>

        {!online ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-semibold">
              <WifiOffIcon className="h-5 w-5" aria-hidden />
              You’re offline
            </p>
            <p className="mt-1">
              Your round is saved. Open it from Rounds when you’re back online to share it.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {state.kind === 'ready' ? (
                <img
                  src={state.imageUrl}
                  alt="Your round card"
                  width={1080}
                  height={1350}
                  className="block h-auto w-full"
                />
              ) : (
                // Reserve the card's 4:5 aspect so the sheet doesn't jump when
                // the image lands.
                <div className="flex aspect-[4/5] items-center justify-center bg-slate-100">
                  {state.kind === 'error' ? (
                    <p className="px-6 text-center text-sm text-slate-600">{state.message}</p>
                  ) : (
                    <span className="flex items-center gap-2 text-sm text-slate-500">
                      <SpinnerIcon className="h-5 w-5" aria-hidden />
                      Building your card…
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {state.kind === 'error' && state.retryable && (
                <button
                  type="button"
                  onClick={() => void publish()}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-fairway-700 px-4 py-3 font-semibold text-white active:bg-fairway-800"
                >
                  Try again
                </button>
              )}

              <button
                type="button"
                onClick={onShare}
                disabled={state.kind !== 'ready'}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-fairway-700 px-4 py-3 font-semibold text-white active:bg-fairway-800 disabled:opacity-50"
              >
                <ShareIcon className="h-5 w-5" aria-hidden />
                Share link
              </button>

              <button
                type="button"
                onClick={onShare}
                disabled={state.kind !== 'ready'}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 active:bg-slate-50 disabled:opacity-60"
              >
                <LinkIcon className="h-5 w-5" aria-hidden />
                Copy link
              </button>
            </div>

            {/* Inline status region, the codebase's substitute for toasts.
                min-h reserves the line so nothing shifts when it fills. */}
            <div aria-live="polite" className="mt-3 min-h-[1.25rem] text-center text-sm">
              {notice.kind === 'ok' && (
                <span className="inline-flex items-center gap-1.5 text-fairway-700">
                  <CheckIcon className="h-4 w-4" aria-hidden />
                  {notice.message}
                </span>
              )}
              {notice.kind === 'bad' && (
                <span className="text-red-600" role="alert">
                  {notice.message}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
