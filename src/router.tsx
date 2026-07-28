import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { HomePage } from '@/features/home/HomePage'
import { RoundsPage } from '@/features/history/RoundsPage'
import { CourseSearchPage } from '@/features/course-search/CourseSearchPage'
import { CourseSetupPage } from '@/features/course-search/CourseSetupPage'
import { RoundEntryPage } from '@/features/round-entry/RoundEntryPage'
import { RoundSummaryPage } from '@/features/round-summary/RoundSummaryPage'
import { SpinnerIcon } from '@/components/icons'

// Stats pulls in the charting library (Recharts). Code-split it so the core
// on-course flow stays lightweight and fast to load / cache offline.
const StatsPage = lazy(() =>
  import('@/features/stats/StatsPage').then((m) => ({ default: m.StatsPage })),
)

function LazyFallback() {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
      <SpinnerIcon className="h-6 w-6" aria-hidden />
      <span className="text-sm">Loading…</span>
    </div>
  )
}

/**
 * Route map. The bottom-nav tabs (Home / Rounds / Stats) and the course-search
 * flow render inside {@link AppLayout}. The focused round-entry and summary
 * flows are top-level (full-screen, no bottom tabs) to maximize on-course space.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'new', element: <CourseSearchPage /> },
      { path: 'new/:courseId', element: <CourseSetupPage /> },
      { path: 'rounds', element: <RoundsPage /> },
      {
        path: 'stats',
        element: (
          <Suspense fallback={<LazyFallback />}>
            <StatsPage />
          </Suspense>
        ),
      },
    ],
  },
  { path: '/round/:roundId', element: <RoundEntryPage /> },
  { path: '/round/:roundId/summary', element: <RoundSummaryPage /> },
])
