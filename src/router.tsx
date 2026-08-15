import { lazy, Suspense, type ReactElement } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { HomePage } from '@/features/home/HomePage'
import { LazyFallback } from '@/components/LazyFallback'

// Only the app shell (AppLayout) and the landing screen (HomePage) load in the
// entry chunk — they're what the first paint needs. Every other route is
// code-split so its code doesn't bloat the initial download/parse (it was ~55%
// of the entry chunk, unused on `/`). The service worker precaches all built JS
// (see vite.config.ts `globPatterns`), so these chunks are cached on first load
// and resolve instantly thereafter — including offline, on-course.
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
const RoundEntryPage = lazy(() =>
  import('@/features/round-entry/RoundEntryPage').then((m) => ({
    default: m.RoundEntryPage,
  })),
)
const RoundSummaryPage = lazy(() =>
  import('@/features/round-summary/RoundSummaryPage').then((m) => ({
    default: m.RoundSummaryPage,
  })),
)
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
// Stats pulls in the charting library (Recharts); splitting it keeps that chunk
// off the core on-course flow entirely.
const StatsPage = lazy(() =>
  import('@/features/stats/StatsPage').then((m) => ({ default: m.StatsPage })),
)

/** Wrap a lazily-loaded route element in a Suspense boundary with the shared
 * fallback, so a not-yet-cached chunk shows the spinner instead of throwing. */
function lazyRoute(element: ReactElement): ReactElement {
  return <Suspense fallback={<LazyFallback />}>{element}</Suspense>
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
  { path: '/round/:roundId', element: lazyRoute(<RoundEntryPage />) },
  { path: '/round/:roundId/summary', element: lazyRoute(<RoundSummaryPage />) },
])
