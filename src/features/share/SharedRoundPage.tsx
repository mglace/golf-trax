import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { WifiOffIcon } from '@/components/icons'

/**
 * In-app rendering of `/r/{shareId}`, the public share landing page.
 *
 * The SERVER owns this path (`api/src/functions/share-page.js`); this component
 * is a backstop for the shell being served in its place, which
 * `NAVIGATION_FALLBACK_DENYLIST` now prevents. It does NOT rescue clients still
 * running a pre-denylist service worker — measured, not assumed: that worker
 * serves its OWN precached shell and entry chunk, which contain no `/r/` route,
 * so those taps still hit the router's 404 until `autoUpdate` activates the new
 * worker and reloads (after which the navigation reaches the server page).
 *
 * What it does cover is a regression: if the denylist ever loses `/r/`, a share
 * link degrades to this card instead of an "Unexpected Application Error"
 * screen. Cheap insurance on the app's main acquisition funnel, and the e2e
 * suite exercises it.
 *
 * It deliberately does NOT redirect to the server page: a navigation is exactly
 * what a shell-serving worker intercepts, so `/api/r/{shareId}` would come back
 * as the shell too. The card image is a subresource request, which no
 * navigation fallback touches.
 */

/** The id charset the API enforces — see `handleSharePage`. */
const SHARE_ID = /^[A-Za-z0-9_-]+$/

/** Matches the server page's CTA so share landings stay separable in GA. */
const APP_URL = '/?utm_source=share&utm_medium=social&utm_campaign=round_card'

/**
 * `offline` is recoverable and worth saying out loud; `unavailable` covers
 * everything else the image endpoint can do — a revoked share (404), a store or
 * render failure (500) — which this page cannot tell apart.
 */
type Failure = 'offline' | 'unavailable'

export function SharedRoundPage() {
  const { shareId = '' } = useParams<{ shareId: string }>()
  const [failure, setFailure] = useState<Failure | null>(null)
  const retryButton = useRef<HTMLButtonElement>(null)
  const retried = useRef(false)

  // A retry tears down the notice — and with it the button the user just
  // pressed — so if the second attempt fails too, focus would be sitting on
  // <body> and the replacement button is a different DOM node. For a keyboard
  // or screen-reader user that reads as the retry doing nothing. Put focus back
  // on the button they pressed, but only when they actually pressed it: seizing
  // focus on the FIRST failure would yank it out of wherever the reader was.
  // (The persistent live region announces the message either way.)
  useEffect(() => {
    if (failure && retried.current) retryButton.current?.focus()
  }, [failure])

  // An <img> error event carries no status code, so the only distinction
  // available is connectivity read AT THE MOMENT OF FAILURE — and it's the one
  // that matters, because it's the difference between "wait and retry" and
  // "there is nothing to see". Everything else stays deliberately vague rather
  // than claiming a revocation the page can't confirm: saying "no longer
  // shared" to someone whose signal dropped sends them away from a round that
  // is still there. (`useOnlineStatus` is the hook for a live banner; this is a
  // point-in-time classification of one failed request, which is why it reads
  // `navigator.onLine` directly.)
  const onImageError = () => setFailure(navigator.onLine ? 'unavailable' : 'offline')

  // Clearing the failure is a real retry, not just a repaint: a failure replaces
  // the <img> with the notice below, so dropping back mounts a fresh element,
  // which issues a fresh request. No cache-busting query needed — verified
  // against a 500 in the e2e suite, which counts the second request.
  const retry = () => {
    retried.current = true
    setFailure(null)
  }

  const src = `/api/share/${encodeURIComponent(shareId)}/image.png`

  const problem: 'invalid' | Failure | null = !SHARE_ID.test(shareId) ? 'invalid' : failure

  return (
    <div className="flex min-h-screen flex-col items-center gap-7 bg-gradient-to-b from-fairway-900 via-[#071b12] to-[#050f0b] px-5 pb-14 pt-8">
      {/* The card slot: the image, or — announced — why it isn't there. */}
      <div className="w-full max-w-[480px]">
        {problem === null && (
          <img
            src={src}
            alt="A shared GolfTrax round card"
            width={1080}
            height={1350}
            onError={onImageError}
            className="block h-auto w-full rounded-[20px] shadow-2xl"
          />
        )}

        {/* Always mounted, following ShareSheet.tsx and SettingsPage.tsx: a live
            region has to be in the accessible tree BEFORE its content changes,
            or screen readers commonly miss an announcement inserted in the same
            mutation as the region itself. Empty it collapses to nothing, so it
            costs no layout while the card is showing. */}
        <div role="status">
          {problem !== null && (
            <Notice>
              {problem === 'invalid' && (
                <p className="text-base text-[#a9c6b6]">That share link isn’t valid.</p>
              )}
              {problem === 'offline' && (
                <>
                  <p className="flex items-center justify-center gap-2 font-semibold text-white">
                    <WifiOffIcon className="h-5 w-5" aria-hidden />
                    You’re offline
                  </p>
                  <p className="mt-1.5 text-base text-[#a9c6b6]">
                    This round card needs a connection to load.
                  </p>
                  <RetryButton onClick={retry} buttonRef={retryButton} />
                </>
              )}
              {problem === 'unavailable' && (
                <>
                  <p className="text-base text-[#a9c6b6]">
                    Couldn’t load this round. It may no longer be shared.
                  </p>
                  <RetryButton onClick={retry} buttonRef={retryButton} />
                </>
              )}
            </Notice>
          )}
        </div>
      </div>

      <div className="w-full max-w-[480px] text-center">
        <h1 className="text-2xl font-bold tracking-tight text-white">Track your rounds. Free.</h1>
        <p className="mt-2.5 text-base leading-relaxed text-[#a9c6b6]">
          GolfTrax works offline on the course and needs no account. Enter your scores, see your
          stats, share your best rounds.
        </p>
        <a
          href={APP_URL}
          className="mt-5 block rounded-full bg-[#34d399] px-6 py-4 text-lg font-bold text-[#052e1e]"
        >
          Open GolfTrax
        </a>
      </div>

      <footer className="text-[13px] text-[#6d8b7b]">Shared from GolfTrax</footer>
    </div>
  )
}

/**
 * The visible box only. The live region is the persistent wrapper in the render
 * above — styling lives here so that region can stay empty and invisible while
 * the card is showing, rather than drawing an empty bordered box.
 */
function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
      {children}
    </div>
  )
}

function RetryButton({
  onClick,
  buttonRef,
}: {
  onClick: () => void
  buttonRef: React.Ref<HTMLButtonElement>
}) {
  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={onClick}
      className="mt-4 min-h-[44px] rounded-full border border-white/25 px-5 font-semibold text-white active:bg-white/10"
    >
      Try again
    </button>
  )
}
