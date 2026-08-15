import { Link } from 'react-router-dom'

/**
 * Fallback shown when a code-split route's chunk fails to load. Two distinct
 * causes, which want different recoveries:
 *  - The offline first-session window, before the service worker is controlling
 *    and has precached the build — the case `router.tsx` cites.
 *  - A stale-chunk 404 after an `autoUpdate` deploy while online.
 *
 * "Go to Home" is a **client-side** navigation to the eager HomePage (it lives
 * in the entry chunk, so no fetch), which recovers in *both* cases — crucially
 * the offline one, where the app shell (bottom nav + the eager on-course flow)
 * is still fully usable and only this one lazy chunk failed. A full
 * `window.location.reload()` there would issue a navigation nothing can serve
 * and strand the user on the browser's own offline error page, losing that
 * still-working shell. "Reload" re-fetches the build and is the right fix once
 * back online (or once the SW is controlling): the stale-chunk 404 clears and
 * the chunk resolves. Both beat the blank screen a `React.lazy` throw would
 * otherwise cause.
 */
export function LazyRouteError() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center text-slate-500">
      <p className="max-w-xs text-sm">
        This screen couldn’t load. Check your connection and try again.
      </p>
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="rounded-2xl bg-fairway-700 px-5 py-2.5 text-sm font-medium text-white"
        >
          Go to Home
        </Link>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-2xl px-5 py-2.5 text-sm font-medium text-fairway-700 underline underline-offset-2"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
