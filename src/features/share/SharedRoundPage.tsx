import { useState } from 'react'
import { useParams } from 'react-router-dom'

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

export function SharedRoundPage() {
  const { shareId = '' } = useParams<{ shareId: string }>()
  const [imageFailed, setImageFailed] = useState(false)

  // An unreadable id and an image that won't load are the same thing to the
  // reader: there is no card to show. The server says as much for a revoked
  // share, so say it here rather than leaving a broken image frame.
  const unavailable = !SHARE_ID.test(shareId) || imageFailed

  return (
    <div className="flex min-h-screen flex-col items-center gap-7 bg-gradient-to-b from-fairway-900 via-[#071b12] to-[#050f0b] px-5 pb-14 pt-8">
      {unavailable ? (
        <p className="mt-6 max-w-md text-center text-base text-[#a9c6b6]">
          This round is no longer shared.
        </p>
      ) : (
        <img
          src={`/api/share/${encodeURIComponent(shareId)}/image.png`}
          alt="A shared GolfTrax round card"
          width={1080}
          height={1350}
          onError={() => setImageFailed(true)}
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
