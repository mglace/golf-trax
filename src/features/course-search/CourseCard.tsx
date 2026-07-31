import { ChevronRightIcon, MapPinIcon } from '@/components/icons'
import { courseSummary, formatCourseName, formatLocation } from '@/domain/course'
import { formatMiles } from '@/domain/geo'
import type { ApiCourse } from '@/api/types'

interface CourseCardProps {
  course: ApiCourse
  onSelect: (course: ApiCourse) => void
  /** Distance from the user, in metres. Shown as a badge when a finite number. */
  distanceMeters?: number | null
}

export function CourseCard({ course, onSelect, distanceMeters }: CourseCardProps) {
  const location = formatLocation(course)
  const summary = courseSummary(course)
  const distance = Number.isFinite(distanceMeters) ? formatMiles(distanceMeters as number) : null

  return (
    <button
      type="button"
      onClick={() => onSelect(course)}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-fairway-300 hover:bg-fairway-50/40 active:bg-fairway-50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900">{formatCourseName(course)}</p>
        {location && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-slate-500">
            <MapPinIcon className="h-4 w-4 shrink-0" aria-hidden />
            {location}
          </p>
        )}
        {summary && (
          <p className="mt-1 text-xs font-medium text-slate-500">
            {summary.holes} holes · Par {summary.par}
          </p>
        )}
      </div>
      {distance && (
        <span className="shrink-0 text-xs font-medium text-slate-500">{distance}</span>
      )}
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-300" aria-hidden />
    </button>
  )
}
