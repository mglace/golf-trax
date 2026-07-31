import { describe, it, expect } from 'vitest'
import {
  getTeeOptions,
  findTee,
  formatLocation,
  formatCourseName,
  courseSummary,
  hasTeeData,
} from './course'
import type { ApiCourse, ApiTeeBox } from '@/api/types'

function tee(name: string, overrides: Partial<ApiTeeBox> = {}): ApiTeeBox {
  return {
    tee_name: name,
    course_rating: 72.1,
    slope_rating: 130,
    bogey_rating: 95,
    total_yards: 6800,
    total_meters: 6218,
    number_of_holes: 18,
    par_total: 72,
    front_course_rating: 36,
    front_slope_rating: 130,
    front_bogey_rating: 47,
    back_course_rating: 36,
    back_slope_rating: 130,
    back_bogey_rating: 47,
    holes: Array.from({ length: 18 }, (_, i) => ({ par: 4, yardage: 380, handicap: i + 1 })),
    ...overrides,
  }
}

function course(overrides: Partial<ApiCourse> = {}): ApiCourse {
  return {
    id: '1',
    club_name: 'Pebble Beach Golf Links',
    course_name: 'Pebble Beach Golf Links',
    location: { address: '', city: 'Pebble Beach', state: 'CA', country: 'United States' },
    tees: { male: [tee('Blue'), tee('White')], female: [tee('Red')] },
    ...overrides,
  }
}

describe('getTeeOptions', () => {
  it('flattens male then female tees, preserving order', () => {
    const opts = getTeeOptions(course())
    expect(opts.map((o) => `${o.gender}:${o.teeName}`)).toEqual([
      'male:Blue',
      'male:White',
      'female:Red',
    ])
  })

  it('handles a course with only one gender of tees', () => {
    const opts = getTeeOptions(course({ tees: { male: [tee('Blue')], female: [] } }))
    expect(opts).toHaveLength(1)
    expect(opts[0].gender).toBe('male')
  })

  it('returns an empty list when there are no tees', () => {
    const opts = getTeeOptions(course({ tees: { male: [], female: [] } }))
    expect(opts).toEqual([])
  })
})

describe('findTee', () => {
  it('finds a tee by gender and name', () => {
    const found = findTee(course(), 'female', 'Red')
    expect(found?.tee_name).toBe('Red')
  })

  it('returns undefined for a missing tee', () => {
    expect(findTee(course(), 'male', 'Gold')).toBeUndefined()
  })
})

describe('formatLocation', () => {
  it('formats city and state', () => {
    expect(formatLocation(course())).toBe('Pebble Beach, CA')
  })

  it('falls back to country when state is missing', () => {
    const c = course({ location: { address: '', city: 'St Andrews', state: '', country: 'Scotland' } })
    expect(formatLocation(c)).toBe('St Andrews, Scotland')
  })
})

describe('formatCourseName', () => {
  it('dedupes identical club and course names', () => {
    expect(formatCourseName(course())).toBe('Pebble Beach Golf Links')
  })

  it('joins distinct club and course names', () => {
    const c = course({ club_name: 'Bandon Dunes', course_name: 'Old Macdonald' })
    expect(formatCourseName(c)).toBe('Bandon Dunes — Old Macdonald')
  })
})

describe('courseSummary', () => {
  it('summarizes holes and par from the first tee', () => {
    expect(courseSummary(course())).toEqual({ holes: 18, par: 72 })
  })

  it('returns null when no tees exist', () => {
    expect(courseSummary(course({ tees: { male: [], female: [] } }))).toBeNull()
  })
})

describe('hasTeeData', () => {
  it('is true when a male or female tee box exists', () => {
    expect(hasTeeData(course())).toBe(true)
    expect(hasTeeData(course({ tees: { male: [tee('Blue')], female: [] } }))).toBe(true)
    expect(hasTeeData(course({ tees: { male: [], female: [tee('Red')] } }))).toBe(true)
  })

  it('is false for a lean search result with no tees', () => {
    expect(hasTeeData(course({ tees: { male: [], female: [] } }))).toBe(false)
    // Tolerates a missing/partial `tees` object (lean search shape).
    expect(hasTeeData(course({ tees: undefined as never }))).toBe(false)
  })
})
