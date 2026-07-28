import { useNavigate } from 'react-router-dom'
import { useCourseSearch } from './useCourseSearch'
import { SearchBar } from './SearchBar'
import { CourseCard } from './CourseCard'
import { RecentlyPlayed } from './RecentlyPlayed'
import { ApiErrorMessage } from '@/components/ApiErrorMessage'
import { ChevronLeftIcon, SearchIcon } from '@/components/icons'
import { cacheCourse } from '@/db/coursesRepo'
import type { ApiCourse } from '@/api/types'

/**
 * Course Search & Selection screen (Milestone 2). Search GolfCourseAPI, browse
 * results and recently-played courses, and pick one to continue to tee/round
 * setup.
 */
export function CourseSearchPage() {
  const navigate = useNavigate()
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

      <div className="mt-4 space-y-3">
        {status === 'error' && error && <ApiErrorMessage error={error} onRetry={retry} />}

        {status === 'idle' && query.trim().length < 2 && (
          <>
            <RecentlyPlayed onSelect={handleSelect} />
            <div className="mt-6 flex flex-col items-center gap-2 py-8 text-center text-slate-500">
              <SearchIcon className="h-8 w-8" aria-hidden />
              <p className="text-sm">Search for a course by name or city to get started.</p>
            </div>
          </>
        )}

        {showEmpty && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            <p className="font-medium text-slate-700">No courses found</p>
            <p className="mt-1">
              Try a different spelling or search by city. Courses that aren’t in GolfCourseAPI can’t
              be logged yet.
            </p>
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
