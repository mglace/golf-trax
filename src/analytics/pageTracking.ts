import { trackPageView } from './gtag'

/**
 * The minimal slice of the React Router data router this module needs. Typed
 * structurally rather than importing the full `Router`/`RouterState` types so
 * the analytics layer stays decoupled from router internals.
 *
 * This interface is also the safety net for the router coupling: `main.tsx`
 * calls `startPageTracking(router)` with the concrete `createBrowserRouter`
 * instance, so if a React Router upgrade removes or reshapes `subscribe` /
 * `state.location`, `npm run typecheck` fails here rather than silently
 * dropping page views. (A behavioural change in *when* subscribers fire would
 * not be caught by types — that residual risk is why the fire conditions below
 * are kept deliberately simple.)
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
 * Why the router subscription rather than a `useLocation()` effect in a
 * component: the focused round-entry and round-summary flows render as
 * top-level routes *outside* `AppLayout` (see `src/router.tsx`), so a tracker
 * mounted in the layout would miss them. Subscribing to the data router covers
 * every route from one place without restructuring the route tree. `subscribe`
 * is a data-router API; the `TrackableRouter` contract above keeps its use
 * type-checked against the real router.
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
