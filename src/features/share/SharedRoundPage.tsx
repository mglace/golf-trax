import { useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { WifiOffIcon } from '@/components/icons'

/**
 * In-app rendering of `/r/{shareId}`, the public share landing page.
 *
 * Normally the SERVER answers this path (`api/src/functions/share-page.js`) and
 * the SPA never sees it. This route exists for the case where the shell gets
 * served anyway — an already-installed service worker whose navigation fallback
 * predates `navigationDenylist.ts` still answers share links from its precache,
 * and it only picks up the fix after the shell has loaded once. Without a route
 * here, those taps land on the router's "Unexpected Application Error! 404 Not
 * Found" screen.
 *
 * It deliberately does NOT redirect to the server page: a navigation is exactly
 * what such a service worker intercepts, so `/api/r/{shareId}` would be
 * answered with the shell too. The card image is a subresource request instead,
 * which no navigation fallback touches — so this works on old and new service
 * workers alike, and keeps the pretty URL.
 *
 * Kept eager in the entry chunk (see the routing notes in `src/router.tsx`): a
 * lazy chunk here would be one more thing to fetch on the connection that just
 * failed to reach the server page.
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
  const retry = () => setFailure(null)

  const src = `/api/share/${encodeURIComponent(shareId)}/image.png`

  return (
    <div className="flex min-h-screen flex-col items-center gap-7 bg-gradient-to-b from-fairway-900 via-[#071b12] to-[#050f0b] px-5 pb-14 pt-8">
      {!SHARE_ID.test(shareId) ? (
        <Notice>
          <p className="text-base text-[#a9c6b6]">That share link isn’t valid.</p>
        </Notice>
      ) : failure === 'offline' ? (
        <Notice>
          <p className="flex items-center justify-center gap-2 font-semibold text-white">
            <WifiOffIcon className="h-5 w-5" aria-hidden />
            You’re offline
          </p>
          <p className="mt-1.5 text-base text-[#a9c6b6]">
            This round card needs a connection to load.
          </p>
          <RetryButton onClick={retry} />
        </Notice>
      ) : failure === 'unavailable' ? (
        <Notice>
          <p className="text-base text-[#a9c6b6]">
            Couldn’t load this round. It may no longer be shared.
          </p>
          <RetryButton onClick={retry} />
        </Notice>
      ) : (
        <img
          src={src}
          alt="A shared GolfTrax round card"
          width={1080}
          height={1350}
          onError={onImageError}
          className="block h-auto w-full max-w-[480px] rounded-[20px] shadow-2xl"
        />
      )}

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

/** Stands in for the card, so the CTA below it doesn't jump around. */
function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 w-full max-w-[480px] rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
      {children}
    </div>
  )
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 min-h-[44px] rounded-full border border-white/25 px-5 font-semibold text-white active:bg-white/10"
    >
      Try again
    </button>
  )
}
