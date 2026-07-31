import { describe, it, expect } from 'vitest'
import {
  courseCoords,
  formatMiles,
  haversineMeters,
  nearbyCourses,
  sortCoursesByDistance,
  withKnownCoords,
} from './geo'
import type { ApiCourse } from '@/api/types'

function course(id: number, lat?: number, lng?: number): ApiCourse {
  return {
    id,
    club_name: `Course ${id}`,
    course_name: '',
    location: { address: '', city: '', state: '', country: '', latitude: lat, longitude: lng },
    tees: { male: [], female: [] },
  }
}

describe('haversineMeters', () => {
  it('is ~0 for the same point', () => {
    expect(haversineMeters({ lat: 38.72, lng: -75.08 }, { lat: 38.72, lng: -75.08 })).toBeCloseTo(0, 5)
  })

  it('matches a known distance (NYC → LA ≈ 3936 km)', () => {
    const nyc = { lat: 40.7128, lng: -74.006 }
    const la = { lat: 34.0522, lng: -118.2437 }
    const km = haversineMeters(nyc, la) / 1000
    expect(km).toBeGreaterThan(3930)
    expect(km).toBeLessThan(3950)
  })

  it('is symmetric', () => {
    const a = { lat: 38.72, lng: -75.08 }
    const b = { lat: 39.29, lng: -76.61 }
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6)
  })
})

describe('courseCoords', () => {
  it('returns coords for a located course', () => {
    expect(courseCoords(course(1, 38.7, -75.1))).toEqual({ lat: 38.7, lng: -75.1 })
  })
  it('is null for missing, non-finite, or (0,0) coordinates', () => {
    expect(courseCoords(course(1))).toBeNull()
    expect(courseCoords(course(1, NaN, -75))).toBeNull()
    expect(courseCoords(course(1, 0, 0))).toBeNull() // manual/unlocated default
  })
})

describe('nearbyCourses', () => {
  const origin = { lat: 38.72, lng: -75.08 } // Rehoboth Beach, DE

  it('keeps only located courses within range, nearest first', () => {
    const courses = [
      course(1, 38.73, -75.09), // ~1 mi
      course(2, 38.9, -75.4), // ~20 mi
      course(3), // no coords → excluded
      course(4, 40.7, -74.0), // ~150 mi → out of range
      course(5, 38.7, -75.1), // ~1.5 mi
    ]
    const ids = nearbyCourses(courses, origin, { maxMiles: 60 }).map((n) => n.course.id)
    expect(ids).toEqual([1, 5, 2]) // 3 excluded (no coords), 4 excluded (out of range)
  })

  it('respects the limit', () => {
    const courses = [course(1, 38.73, -75.09), course(2, 38.7, -75.1), course(3, 38.71, -75.07)]
    expect(nearbyCourses(courses, origin, { limit: 2 })).toHaveLength(2)
  })
})

describe('sortCoursesByDistance', () => {
  const origin = { lat: 38.72, lng: -75.08 } // Rehoboth Beach, DE

  it('orders located courses nearest-first and keeps distances', () => {
    const courses = [
      course(1, 38.9, -75.4), // ~20 mi
      course(2, 38.73, -75.09), // ~1 mi
      course(3, 40.7, -74.0), // ~150 mi (not capped — still included)
    ]
    const ranked = sortCoursesByDistance(courses, origin)
    expect(ranked.map((r) => r.course.id)).toEqual([2, 1, 3])
    expect(ranked.every((r) => typeof r.distanceMeters === 'number')).toBe(true)
  })

  it('keeps every course, sinking un-located ones to the bottom in original order', () => {
    const courses = [
      course(1), // no coords
      course(2, 38.9, -75.4), // ~20 mi
      course(3, 0, 0), // (0,0) → treated as un-located
      course(4, 38.73, -75.09), // ~1 mi
    ]
    const ranked = sortCoursesByDistance(courses, origin)
    // Located nearest-first (4, 2), then un-located in original order (1, 3).
    expect(ranked.map((r) => r.course.id)).toEqual([4, 2, 1, 3])
    expect(ranked[2].distanceMeters).toBeNull()
    expect(ranked[3].distanceMeters).toBeNull()
  })

  it('is a stable sort for equal distances', () => {
    const courses = [course(1, 38.73, -75.09), course(2, 38.73, -75.09)]
    expect(sortCoursesByDistance(courses, origin).map((r) => r.course.id)).toEqual([1, 2])
  })

  it('returns an empty array for no courses', () => {
    expect(sortCoursesByDistance([], origin)).toEqual([])
  })

  it('preserves original order with null distances when nothing is located', () => {
    const courses = [course(1), course(2, 0, 0), course(3)]
    const ranked = sortCoursesByDistance(courses, origin)
    expect(ranked.map((r) => r.course.id)).toEqual([1, 2, 3])
    expect(ranked.every((r) => r.distanceMeters === null)).toBe(true)
  })
})

describe('withKnownCoords', () => {
  it('fills missing coordinates from the lookup by course id', () => {
    const [filled] = withKnownCoords([course(1)], new Map([[1, { lat: 38.7, lng: -75.1 }]]))
    expect(courseCoords(filled)).toEqual({ lat: 38.7, lng: -75.1 })
  })

  it('leaves a course that already has coordinates untouched', () => {
    const original = course(1, 40.0, -74.0)
    const [result] = withKnownCoords([original], new Map([[1, { lat: 38.7, lng: -75.1 }]]))
    expect(result).toBe(original) // same reference — not rebuilt
  })

  it('leaves a course unchanged when the lookup has no entry for it', () => {
    const original = course(1)
    const [result] = withKnownCoords([original], new Map())
    expect(result).toBe(original)
    expect(courseCoords(result)).toBeNull()
  })

  it('makes lean results rankable by sortCoursesByDistance', () => {
    const origin = { lat: 38.72, lng: -75.08 }
    const results = [course(1), course(2)] // lean: no coords
    const coordsById = new Map([[2, { lat: 38.73, lng: -75.09 }]]) // only #2 is known
    const ranked = sortCoursesByDistance(withKnownCoords(results, coordsById), origin)
    // #2 has coords → ranked first; #1 stays unlocated at the bottom.
    expect(ranked.map((r) => r.course.id)).toEqual([2, 1])
    expect(ranked[0].distanceMeters).toBeGreaterThan(0)
    expect(ranked[1].distanceMeters).toBeNull()
  })
})

describe('formatMiles', () => {
  it('shows one decimal under 10 miles, whole numbers above', () => {
    expect(formatMiles(1609.344 * 0.42)).toBe('0.4 mi')
    expect(formatMiles(1609.344 * 2.34)).toBe('2.3 mi')
    expect(formatMiles(1609.344 * 17.8)).toBe('18 mi')
  })
})
