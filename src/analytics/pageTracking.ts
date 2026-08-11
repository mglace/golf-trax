import { trackPageView } from './gtag'

/**
 * The minimal slice of the React Router data router this module needs. Typed
 * structurally rather than importing the full `Router`/`RouterState` types so
 * the analytics layer stays decoupled from router internals; the real router
 * instance satisfies this shape.
 */
interface TrackableRouter {
  state: { location: { pathname: string } }
  subscribe(
    fn: (state: {
      location: { pathname: string }
      navigation: { state: string }
    }) => void,
  ): () => void
}

/**
 * Wire GA4 page views to client-side navigations. `createBrowserRouter` swaps
 * routes without a document load, so we subscribe to the router and emit a
 * page_view each time navigation settles on a new path.
 *
 * The initial load is reported immediately; thereafter we fire only when the
 * router reaches an idle state on a pathname different from the last one — this
 * skips the intermediate `loading` transitions and de-dupes replace/search-only
 * updates that don't change the page. A no-op when analytics is unconfigured
 * (trackPageView guards itself), so it's always safe to call from `main.tsx`.
 */
export function startPageTracking(router: TrackableRouter): () => void {
  let lastPath = router.state.location.pathname
  trackPageView(lastPath)

  return router.subscribe((state) => {
    if (state.navigation.state !== 'idle') return
    const path = state.location.pathname
    if (path === lastPath) return
    lastPath = path
    trackPageView(path)
  })
}
