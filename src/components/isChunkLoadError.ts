/**
 * Whether an error is a failed dynamic `import()` — a code-split chunk that
 * couldn't be fetched/loaded — as opposed to a genuine render error. The route
 * {@link ErrorBoundary} uses this to only show the "check your connection /
 * reload" prompt for chunk-load failures; a real render bug (a bad record
 * blowing up a page, a null deref) should surface via the outer boundary, not
 * be misattributed to the network with a reload that recurs on every render.
 *
 * The message varies by engine (all `TypeError`s thrown by the module loader):
 *  - Chromium: "Failed to fetch dynamically imported module: …"
 *  - Firefox:  "error loading dynamically imported module: …"
 *  - Safari:   "Importing a module script failed."
 * Some toolchains also tag the error `name` as "ChunkLoadError".
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'ChunkLoadError') return true
  return /dynamically imported module|importing a module script failed/i.test(
    error.message,
  )
}
