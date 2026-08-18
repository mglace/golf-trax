import { lazy, Suspense, type ReactElement } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { HomePage } from '@/features/home/HomePage'
import { RoundEntryPage } from '@/features/round-entry/RoundEntryPage'
import { RoundSummaryPage } from '@/features/round-summary/RoundSummaryPage'
import { SharedRoundPage } from '@/features/share/SharedRoundPage'
import { LazyFallback } from '@/components/LazyFallback'
import { LazyRouteError } from '@/components/LazyRouteError'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { isChunkLoadError } from '@/components/isChunkLoadError'

// Code-split the round-start + peripheral routes so their code doesn't bloat the
// entry chunk (it was ~55% of it, unused on `/`). The service worker precaches
// all built JS (vite.config.ts `globPatterns`), so once it's controlling the
// page these chunks resolve instantly, offline included.
//
// EAGER (entry chunk): the app shell, HomePage, the on-course
// RoundEntryPage/RoundSummaryPage, and SharedRoundPage. CLAUDE.md requires the
// on-course flow to work offline from a cold first launch, and on the very first
// visit the SW isn't controlling yet — a lazy chunk there could fail on spotty
// on-course signal, exactly where it matters most. SharedRoundPage is eager for
// a related reason: it only renders when a stale service worker served the shell
// instead of the server's landing page, so it must not need another fetch.
//
// LAZY: the round-start flow (course search / setup / manual), rounds history,
// settings, and stats. The round-start flow *does* support offline (search
// lists cached courses; manual entry needs no network) — but reaching it
// offline requires a prior online session, which is also when the SW precaches
// these chunks, so the first-session chunk-fetch risk is bounded, unlike the
// on-course screens above. Each lazy route is wrapped in an error boundary
// (keyed per route) so a failed fetch shows a retry instead of a stuck screen.
const RoundsPage = lazy(() =>
  import('@/features/history/RoundsPage').then((m) => ({ default: m.RoundsPage })),
)
const CourseSearchPage = lazy(() =>
  import('@/features/course-search/CourseSearchPage').then((m) => ({
    default: m.CourseSearchPage,
  })),
)
const CourseSetupPage = lazy(() =>
  import('@/features/course-search/CourseSetupPage').then((m) => ({
    default: m.CourseSetupPage,
  })),
)
const ManualCourseForm = lazy(() =>
  import('@/features/course-search/ManualCourseForm').then((m) => ({
    default: m.ManualCourseForm,
  })),
)
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
// Stats pulls in the charting library (Recharts); splitting it keeps that heavy
// chunk off the core on-course flow entirely.
const StatsPage = lazy(() =>
  import('@/features/stats/StatsPage').then((m) => ({ default: m.StatsPage })),
)

/**
 * Wrap a lazily-loaded route element in a per-route-keyed error boundary +
 * Suspense. The `id` key gives each route its own boundary instance: React
 * Router renders route elements into `AppLayout`'s `<Outlet/>` without a key, so
 * without this the boundary (and its error state) would be reused across
 * sibling lazy routes — a failed chunk on one would leave the error screen stuck
 * when navigating to a healthy one. Keying per route makes each navigation mount
 * a fresh boundary.
 *
 * `shouldCatch={isChunkLoadError}` scopes the reload prompt to a failed chunk
 * *fetch* (the offline-before-precache case it's for). A genuine render bug in
 * the loaded page is re-thrown to the router's own error boundary rather than
 * mislabeled a connection problem behind a reload that just recurs.
 */
function lazyRoute(id: string, element: ReactElement): ReactElement {
  return (
    <ErrorBoundary key={id} fallback={<LazyRouteError />} shouldCatch={isChunkLoadError}>
      <Suspense fallback={<LazyFallback />}>{element}</Suspense>
    </ErrorBoundary>
  )
}

/**
 * Route map. The bottom-nav tabs (Home / Rounds / Stats) and the course-search
 * flow render inside {@link AppLayout}. The focused round-entry and summary
 * flows are top-level (full-screen, no bottom tabs) to maximize on-course space.
 *
 * NOTE: when adding a route that carries an opaque id (`:something`), add a
 * matching rule to `toRoutePattern` in `src/analytics/routePath.ts` so the id
 * is collapsed before it reaches Google Analytics. The normalizer collapses
 * common id shapes (uuid / numeric / hex / digit-bearing token) as a best-effort
 * safety net, but a named rule is what reliably collapses the id and keeps the
 * GA reports readable.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      // `handle.screen` marks the three tab routes for AppLayout's persistent
      // AppHeader (see TabHandle there) — omit it on any route that should
      // keep rendering its own header instead.
      { index: true, element: <HomePage />, handle: {} },
      { path: 'new', element: lazyRoute('new', <CourseSearchPage />) },
      { path: 'new/manual', element: lazyRoute('new-manual', <ManualCourseForm />) },
      { path: 'new/:courseId', element: lazyRoute('new-course', <CourseSetupPage />) },
      {
        path: 'rounds',
        element: lazyRoute('rounds', <RoundsPage />),
        handle: { screen: 'Rounds' },
      },
      { path: 'settings', element: lazyRoute('settings', <SettingsPage />) },
      {
        path: 'stats',
        element: lazyRoute('stats', <StatsPage />),
        handle: { screen: 'Stats' },
      },
    ],
  },
  { path: '/round/:roundId', element: <RoundEntryPage /> },
  { path: '/round/:roundId/summary', element: <RoundSummaryPage /> },
  // Normally served by the backend, not here — see SharedRoundPage for why the
  // SPA needs a route for it anyway.
  { path: '/r/:shareId', element: <SharedRoundPage /> },
])
