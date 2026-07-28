import { useLiveQuery } from 'dexie-react-hooks'
import { getRecentlyPlayed } from '@/db/coursesRepo'
import { formatCourseName, formatLocation } from '@/domain/course'
import type { ApiCourse } from '@/api/types'

interface RecentlyPlayedProps {
  onSelect: (course: ApiCourse) => void
}

/**
 * Horizontally-scrollable carousel of recently-played courses. Renders nothing
 * until at least one round has been played (no lastPlayedDate before then).
 */
export function RecentlyPlayed({ onSelect }: RecentlyPlayedProps) {
  const recents = useLiveQuery(() => getRecentlyPlayed(10), [], [])

  if (!recents || recents.length === 0) return null

  return (
    <section aria-labelledby="recents-heading" className="mt-2">
      <h2 id="recents-heading" className="mb-2 text-sm font-semibold text-slate-600">
        Recently played
      </h2>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {recents.map((course) => (
          <button
            key={course.id}
            type="button"
            onClick={() => onSelect(course)}
            className="w-44 shrink-0 snap-start rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-fairway-300 hover:bg-fairway-50/40"
          >
            <p className="truncate text-sm font-semibold text-slate-900">
              {formatCourseName(course)}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{formatLocation(course)}</p>
          </button>
        ))}
      </div>
    </section>
  )
}
