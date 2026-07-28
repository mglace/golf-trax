/**
 * Pure helpers for reading a GolfCourseAPI course: flattening tee boxes into
 * selectable options, formatting location, and summarizing par/holes.
 *
 * Kept free of React/Dexie so it's trivially unit-testable.
 */
import type { ApiCourse, ApiTeeBox } from '@/api/types'
import type { Gender } from '@/db/types'

export interface TeeOption {
  gender: Gender
  teeName: string
  courseRating: number
  slopeRating: number
  totalYards: number
  numberOfHoles: number
  parTotal: number
  tee: ApiTeeBox
}

/**
 * Flatten `tees.male` / `tees.female` into a single ordered list of options.
 * Men's tees are listed first, then women's; within each, the API order is
 * preserved (typically longest→shortest).
 */
export function getTeeOptions(course: ApiCourse): TeeOption[] {
  const build = (boxes: ApiTeeBox[] | undefined, gender: Gender): TeeOption[] =>
    (boxes ?? []).map((tee) => ({
      gender,
      teeName: tee.tee_name,
      courseRating: tee.course_rating,
      slopeRating: tee.slope_rating,
      totalYards: tee.total_yards,
      numberOfHoles: tee.number_of_holes,
      parTotal: tee.par_total,
      tee,
    }))

  return [...build(course.tees?.male, 'male'), ...build(course.tees?.female, 'female')]
}

/** Look up a specific tee box by (gender, teeName). */
export function findTee(
  course: ApiCourse,
  gender: Gender,
  teeName: string,
): ApiTeeBox | undefined {
  return course.tees?.[gender]?.find((t) => t.tee_name === teeName)
}

/** "City, ST" (falls back to country when state is absent). */
export function formatLocation(course: ApiCourse): string {
  const { city, state, country } = course.location ?? {}
  const parts = [city, state || country].filter(Boolean)
  return parts.join(', ')
}

/** Full display name: "Club Name — Course Name" (deduped when identical). */
export function formatCourseName(course: ApiCourse): string {
  const club = course.club_name?.trim()
  const name = course.course_name?.trim()
  if (!club) return name ?? 'Unknown course'
  if (!name || name === club) return club
  return `${club} — ${name}`
}

/**
 * A representative hole count / par for a course card, taken from the first
 * available tee box (par is consistent across tees; hole count too).
 */
export function courseSummary(course: ApiCourse): { holes: number; par: number } | null {
  const first = course.tees?.male?.[0] ?? course.tees?.female?.[0]
  if (!first) return null
  return { holes: first.number_of_holes, par: first.par_total }
}
