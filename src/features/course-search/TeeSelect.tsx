import { getTeeOptions, type TeeOption } from '@/domain/course'
import type { ApiCourse } from '@/api/types'
import type { Gender } from '@/db/types'

export interface SelectedTee {
  gender: Gender
  teeName: string
}

interface TeeSelectProps {
  course: ApiCourse
  value: SelectedTee | null
  onChange: (tee: SelectedTee) => void
}

const GENDER_LABEL: Record<Gender, string> = {
  male: "Men's tees",
  female: "Women's tees",
}

function isSelected(value: SelectedTee | null, opt: TeeOption): boolean {
  return value?.gender === opt.gender && value?.teeName === opt.teeName
}

/**
 * Radio-style tee selector. Uses whatever tee names the API returns (never
 * hardcodes colors) and groups by gender when both sets exist.
 */
export function TeeSelect({ course, value, onChange }: TeeSelectProps) {
  const options = getTeeOptions(course)

  if (options.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
        This course has no tee data in GolfCourseAPI, so it can’t be logged yet.
      </div>
    )
  }

  const hasBothGenders =
    options.some((o) => o.gender === 'male') && options.some((o) => o.gender === 'female')

  // Preserve order; only insert group headers when both genders are present.
  let lastGender: Gender | null = null

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-slate-600">Select tee box</legend>
      <div className="space-y-2">
        {options.map((opt) => {
          const showHeader = hasBothGenders && opt.gender !== lastGender
          lastGender = opt.gender
          const selected = isSelected(value, opt)
          return (
            <div key={`${opt.gender}-${opt.teeName}`}>
              {showHeader && (
                <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {GENDER_LABEL[opt.gender]}
                </p>
              )}
              <label
                className={[
                  'flex cursor-pointer items-center gap-3 rounded-xl border p-3 shadow-sm transition-colors',
                  selected
                    ? 'border-fairway-500 bg-fairway-50 ring-1 ring-fairway-500'
                    : 'border-slate-200 bg-white hover:border-fairway-300',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="tee"
                  className="h-5 w-5 accent-fairway-600"
                  checked={selected}
                  onChange={() => onChange({ gender: opt.gender, teeName: opt.teeName })}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900">{opt.teeName}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {opt.totalYards.toLocaleString()} yds · Par {opt.parTotal}
                    {opt.courseRating > 0 && (
                      <>
                        {' '}
                        · {opt.courseRating.toFixed(1)}/{opt.slopeRating}
                      </>
                    )}
                  </span>
                </span>
              </label>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
