/**
 * Pure builder + validator for manually-entered courses (Phase 2d).
 *
 * When a course isn't in GolfCourseAPI, the user can enter it by hand. A manual
 * course is assembled into the SAME `ApiCourse` shape the rest of the app
 * already consumes (search, tee selection, `buildHoles`, round snapshotting), so
 * nothing downstream needs to know it was hand-entered. It's assigned a
 * **negative id** so it can never collide with GolfCourseAPI's positive ids.
 *
 * No React/Dexie here — assembly and the validation of user input are
 * unit-tested in isolation (mirrors the `domain/backup.ts` pattern).
 */
import type { ApiCourse, ApiHole, ApiTeeBox } from '@/api/types'
import type { Gender } from '@/db/types'

export interface ManualHoleInput {
  par: number
  handicap: number
  yardage: number
}

export interface ManualCourseInput {
  clubName: string
  courseName: string
  city: string
  state: string
  gender: Gender
  teeName: string
  /** 9 or 18 holes, in course order (index 0 = hole 1). */
  holes: ManualHoleInput[]
}

export const MANUAL_HOLE_COUNTS = [9, 18] as const
const MIN_PAR = 3
const MAX_PAR = 7

/** A blank hole grid for the form: par 4, sequential handicap, 0 yards. */
export function blankHoles(count: number): ManualHoleInput[] {
  return Array.from({ length: count }, (_, i) => ({ par: 4, handicap: i + 1, yardage: 0 }))
}

/** A fresh, empty form seeded with 18 holes. */
export function blankManualCourse(): ManualCourseInput {
  return {
    clubName: '',
    courseName: '',
    city: '',
    state: '',
    gender: 'male',
    teeName: 'Default',
    holes: blankHoles(18),
  }
}

/**
 * Validate user input. Returns a map of field → message (empty when valid). The
 * goal is to reject anything that would corrupt the store or the scorecard math
 * (non-finite pars, wrong hole counts), while staying lenient on optional data.
 */
export function validateManualCourse(input: ManualCourseInput): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!input.clubName.trim()) errors.clubName = 'Enter a course or club name.'
  if (!input.teeName.trim()) errors.teeName = 'Enter a tee name.'
  if (!(MANUAL_HOLE_COUNTS as readonly number[]).includes(input.holes.length)) {
    errors.holes = 'A course must have 9 or 18 holes.'
  } else {
    const badPar = input.holes.some(
      (h) => !Number.isFinite(h.par) || h.par < MIN_PAR || h.par > MAX_PAR,
    )
    if (badPar) errors.holes = `Every hole needs a par between ${MIN_PAR} and ${MAX_PAR}.`
  }
  return errors
}

/** True when {@link validateManualCourse} finds no problems. */
export function isManualCourseValid(input: ManualCourseInput): boolean {
  return Object.keys(validateManualCourse(input)).length === 0
}

/**
 * The next id for a manual course: one below the most-negative existing id
 * (starting at -1). Monotonic and collision-free against both API ids (positive)
 * and other manual courses.
 */
export function nextManualCourseId(existingIds: number[]): number {
  const min = existingIds.reduce((m, id) => (id < m ? id : m), 0)
  return min - 1
}

function sanitizeHole(h: ManualHoleInput, index: number): ApiHole {
  return {
    par: h.par,
    // Handicap/yardage are optional niceties; coerce non-finite to safe values
    // so the scorecard never sees NaN.
    handicap: Number.isFinite(h.handicap) ? h.handicap : index + 1,
    yardage: Number.isFinite(h.yardage) && h.yardage > 0 ? h.yardage : 0,
  }
}

/**
 * Assemble a validated manual input into an `ApiCourse` with the given id. The
 * single tee box carries the entered holes; unknown ratings are 0 (the UI shows
 * these as unavailable rather than a bogus rating).
 */
export function buildManualCourse(input: ManualCourseInput, id: number): ApiCourse {
  const holes = input.holes.map(sanitizeHole)
  const parTotal = holes.reduce((sum, h) => sum + h.par, 0)
  const totalYards = holes.reduce((sum, h) => sum + h.yardage, 0)

  const tee: ApiTeeBox = {
    tee_name: input.teeName.trim() || 'Default',
    course_rating: 0,
    slope_rating: 0,
    bogey_rating: 0,
    total_yards: totalYards,
    total_meters: 0,
    number_of_holes: holes.length,
    par_total: parTotal,
    front_course_rating: 0,
    front_slope_rating: 0,
    front_bogey_rating: 0,
    back_course_rating: 0,
    back_slope_rating: 0,
    back_bogey_rating: 0,
    holes,
  }

  return {
    id,
    club_name: input.clubName.trim(),
    course_name: input.courseName.trim(),
    location: {
      address: '',
      city: input.city.trim(),
      state: input.state.trim(),
      country: '',
    },
    tees: {
      male: input.gender === 'male' ? [tee] : [],
      female: input.gender === 'female' ? [tee] : [],
    },
  }
}
