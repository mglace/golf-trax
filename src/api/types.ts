/**
 * Raw response shapes from GolfCourseAPI (https://api.golfcourseapi.com).
 *
 * These mirror the API's OpenAPI schema verbatim. We cache these objects as-is
 * (see {@link CachedCourse}) so that our data layer always reflects the real
 * upstream shape. Domain/UI code derives everything it needs from a selected
 * tee box rather than reshaping the payload on ingest.
 */

/** A single hole as described by a tee box. Order implies hole number (index 0 = hole 1). */
export interface ApiHole {
  par: number
  yardage: number
  /** Stroke index / difficulty rank (1 = hardest). */
  handicap: number
}

/**
 * A tee box carries its OWN complete hole data, ratings, and yardages.
 * Par/handicap/yardage therefore live per-tee, not at the course level.
 */
export interface ApiTeeBox {
  tee_name: string
  course_rating: number
  slope_rating: number
  bogey_rating: number
  total_yards: number
  total_meters: number
  number_of_holes: number
  par_total: number
  front_course_rating: number
  front_slope_rating: number
  front_bogey_rating: number
  back_course_rating: number
  back_slope_rating: number
  back_bogey_rating: number
  holes: ApiHole[]
}

/** Tee boxes grouped by gender. Either array may be empty. */
export interface ApiTees {
  male: ApiTeeBox[]
  female: ApiTeeBox[]
}

export interface ApiLocation {
  address: string
  city: string
  state: string
  country: string
  latitude?: number
  longitude?: number
}

export interface ApiCourse {
  id: number
  club_name: string
  course_name: string
  scorecard_url?: string
  location: ApiLocation
  tees: ApiTees
}

/** Response body of `GET /v1/search`. */
export interface SearchResponse {
  courses: ApiCourse[]
}
