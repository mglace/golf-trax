import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { HomePage } from '@/features/home/HomePage'
import { RoundsPage } from '@/features/history/RoundsPage'
import { CourseSearchPage } from '@/features/course-search/CourseSearchPage'
import { CourseSetupPage } from '@/features/course-search/CourseSetupPage'
import { ManualCourseForm } from '@/features/course-search/ManualCourseForm'
import { RoundEntryPage } from '@/features/round-entry/RoundEntryPage'
import { RoundSummaryPage } from '@/features/round-summary/RoundSummaryPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { LazyFallback } from '@/components/LazyFallback'

// Stats pulls in the charting library (Recharts). Code-split it so the core
// on-course flow stays lightweight and fast to load / cache offline.
const StatsPage = lazy(() =>
  import('@/features/stats/StatsPage').then((m) => ({ default: m.StatsPage })),
)

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
      { path: 'new/manual', element: <ManualCourseForm /> },
      { path: 'new/:courseId', element: <CourseSetupPage /> },
      { path: 'rounds', element: <RoundsPage /> },
      { path: 'settings', element: <SettingsPage /> },
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
