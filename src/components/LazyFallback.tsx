import { SpinnerIcon } from './icons'

/** Suspense fallback for code-split routes (e.g. the Stats page). */
export function LazyFallback() {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
      <SpinnerIcon className="h-6 w-6" aria-hidden />
      <span className="text-sm">Loading…</span>
    </div>
  )
}
