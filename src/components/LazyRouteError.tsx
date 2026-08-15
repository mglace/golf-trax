/**
 * Fallback shown when a code-split route's chunk fails to load — e.g. a dropped
 * connection reaching for a chunk the service worker hasn't precached yet (the
 * first-session window before the SW is controlling). Reloading is the reliable
 * recovery: once the SW has cached the build, the retry resolves from cache,
 * even offline. Better than the blank screen a `React.lazy` throw would cause.
 */
export function LazyRouteError() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center text-slate-500">
      <p className="max-w-xs text-sm">
        This screen couldn’t load. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-2xl bg-fairway-700 px-5 py-2.5 text-sm font-medium text-white"
      >
        Reload
      </button>
    </div>
  )
}
