import { useNavigate } from 'react-router-dom'
import { useCourseSearch } from './useCourseSearch'
import { SearchBar } from './SearchBar'
import { CourseCard } from './CourseCard'
import { RecentlyPlayed } from './RecentlyPlayed'
import { ApiErrorMessage } from '@/components/ApiErrorMessage'
import { ChevronLeftIcon, PlusIcon, SearchIcon, WifiOffIcon } from '@/components/icons'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { cacheCourse } from '@/db/coursesRepo'
import type { ApiCourse } from '@/api/types'

/**
 * Course Search & Selection screen (Milestone 2). Search GolfCourseAPI, browse
 * results and recently-played courses, and pick one to continue to tee/round
 * setup.
 */
export function CourseSearchPage() {
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const { query, setQuery, status, results, error, retry } = useCourseSearch()

  async function handleSelect(course: ApiCourse) {
    // Ensure the chosen course is cached before we route to the setup screen,
    // so that screen can read it from IndexedDB even if the network drops.
    await cacheCourse(course)
    navigate(`/new/${course.id}`)
  }

  const showEmpty = status === 'success' && results.length === 0

  return (
    <div className="py-4">
      <header className="mb-4 flex items-center gap-1">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Back"
          className="-ml-2 rounded-full p-2 text-slate-500 hover:bg-slate-100"
        >
          <ChevronLeftIcon className="h-6 w-6" aria-hidden />
        </button>
        <h1 className="text-xl font-bold tracking-tight">New round</h1>
      </header>

      <SearchBar value={query} onChange={setQuery} loading={status === 'loading'} />

      {!online && (
        <div
          role="status"
          className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <WifiOffIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            You’re offline. Searching for new courses needs a connection, but you can still start a
            round at a recently-played course below.
          </p>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {status === 'error' && error && <ApiErrorMessage error={error} onRetry={retry} />}

        {status === 'idle' && query.trim().length < 2 && (
          <>
            <RecentlyPlayed onSelect={handleSelect} />
            <div className="mt-6 flex flex-col items-center gap-2 py-8 text-center text-slate-500">
              <SearchIcon className="h-8 w-8" aria-hidden />
              <p className="text-sm">Search for a course by name or city to get started.</p>
              <button
                type="button"
                onClick={() => navigate('/new/manual')}
                className="mt-1 text-sm font-semibold text-fairway-700 underline underline-offset-2"
              >
                Or add a course manually
              </button>
            </div>
          </>
        )}

        {showEmpty && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            <p className="font-medium text-slate-700">No courses found</p>
            <p className="mt-1">Try a different spelling or search by city — or add it yourself.</p>
            <button
              type="button"
              onClick={() => navigate('/new/manual')}
              className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-fairway-700 px-4 py-2.5 font-semibold text-white active:bg-fairway-800"
            >
              <PlusIcon className="h-5 w-5" aria-hidden />
              Add this course manually
            </button>
          </div>
        )}

        {status === 'success' && results.length > 0 && (
          <ul className="space-y-2">
            {results.map((course) => (
              <li key={course.id}>
                <CourseCard course={course} onSelect={handleSelect} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
