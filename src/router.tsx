import { lazy, Suspense, type ReactElement } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { HomePage } from '@/features/home/HomePage'
import { RoundEntryPage } from '@/features/round-entry/RoundEntryPage'
import { RoundSummaryPage } from '@/features/round-summary/RoundSummaryPage'
import { LazyFallback } from '@/components/LazyFallback'
import { LazyRouteError } from '@/components/LazyRouteError'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// Code-split the peripheral routes so their code doesn't bloat the entry chunk
// (it was ~55% of it, unused on `/`). The service worker precaches all built JS
// (see vite.config.ts `globPatterns`), so these chunks resolve instantly — and
// offline — once it's controlling the page.
//
// The core on-course flow (HomePage, RoundEntryPage, RoundSummaryPage) stays in
// the entry chunk on purpose: CLAUDE.md requires it to work offline from a cold
// first launch, and on the very first visit the SW isn't controlling yet, so a
// lazy chunk there could fail on a flaky on-course connection. Keeping it eager
// guarantees it's already in memory. The lazy routes below are either
// connectivity-requiring (course search hits the API) or off the on-course path
// (rounds history, settings, stats), and each is wrapped in an error boundary
// so a failed chunk shows a retry instead of blanking the app.
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

/** Wrap a lazily-loaded route element in an error boundary + Suspense: the
 * boundary catches a failed chunk fetch (offering a reload), Suspense shows the
 * spinner while a not-yet-cached chunk loads. */
function lazyRoute(element: ReactElement): ReactElement {
  return (
    <ErrorBoundary fallback={<LazyRouteError />}>
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
      { path: 'new', element: lazyRoute(<CourseSearchPage />) },
      { path: 'new/manual', element: lazyRoute(<ManualCourseForm />) },
      { path: 'new/:courseId', element: lazyRoute(<CourseSetupPage />) },
      {
        path: 'rounds',
        element: lazyRoute(<RoundsPage />),
        handle: { screen: 'Rounds' },
      },
      { path: 'settings', element: lazyRoute(<SettingsPage />) },
      {
        path: 'stats',
        element: lazyRoute(<StatsPage />),
        handle: { screen: 'Stats' },
      },
    ],
  },
  { path: '/round/:roundId', element: <RoundEntryPage /> },
  { path: '/round/:roundId/summary', element: <RoundSummaryPage /> },
])
