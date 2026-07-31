/**
 * Pure geolocation helpers for the "near you" course list (Phase 2d.2).
 *
 * No browser/Dexie APIs here — distance math and the ranking of courses by
 * proximity are unit-tested in isolation (mirrors the other `domain/*` modules).
 * The Geolocation API and Dexie live in the hook/feature layer.
 */
import type { ApiCourse } from '@/api/types'

export interface Coords {
  lat: number
  lng: number
}

const EARTH_RADIUS_M = 6_371_000
const METERS_PER_MILE = 1_609.344

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Great-circle distance between two points in metres (haversine). Accurate to
 * well within the precision this feature needs (ranking nearby courses).
 */
export function haversineMeters(a: Coords, b: Coords): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** A course's coordinates, when it has valid finite lat/lng. */
export function courseCoords(course: ApiCourse): Coords | null {
  const { latitude, longitude } = course.location ?? {}
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  // (0, 0) is in the ocean off Africa — treat it as "no location", since manual
  // courses and unlocated API rows default there rather than to a real spot.
  if (latitude === 0 && longitude === 0) return null
  return { lat: latitude as number, lng: longitude as number }
}

export interface NearbyCourse<T extends ApiCourse = ApiCourse> {
  course: T
  distanceMeters: number
}

/**
 * Rank courses by distance from `origin`: keep only those with real
 * coordinates, within `maxMiles`, nearest first, capped at `limit`.
 */
export function nearbyCourses<T extends ApiCourse>(
  courses: T[],
  origin: Coords,
  opts: { maxMiles?: number; limit?: number } = {},
): NearbyCourse<T>[] {
  const maxMeters = (opts.maxMiles ?? 60) * METERS_PER_MILE
  const limit = opts.limit ?? 6
  const ranked: NearbyCourse<T>[] = []
  for (const course of courses) {
    const coords = courseCoords(course)
    if (!coords) continue
    const distanceMeters = haversineMeters(origin, coords)
    if (distanceMeters <= maxMeters) ranked.push({ course, distanceMeters })
  }
  ranked.sort((a, b) => a.distanceMeters - b.distanceMeters)
  return ranked.slice(0, limit)
}

/** Human-friendly distance in miles: "0.4 mi", "2.3 mi", "17 mi". */
export function formatMiles(meters: number): string {
  const miles = meters / METERS_PER_MILE
  const rounded = miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles)
  return `${rounded} mi`
}
