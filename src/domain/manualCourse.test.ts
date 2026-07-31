import { describe, it, expect } from 'vitest'
import {
  blankHoles,
  blankManualCourse,
  buildManualCourse,
  isManualCourseId,
  isManualCourseValid,
  nextManualCourseId,
  validateManualCourse,
  type ManualCourseInput,
} from './manualCourse'
import { getTeeOptions, findTee } from './course'
import { buildHoles, availableRoundLengths } from './round'

function input(overrides: Partial<ManualCourseInput> = {}): ManualCourseInput {
  return { ...blankManualCourse(), clubName: 'Sandy Pines', ...overrides }
}

describe('blankHoles', () => {
  it('defaults par 4, sequential handicap, 0 yards', () => {
    const holes = blankHoles(9)
    expect(holes).toHaveLength(9)
    expect(holes[0]).toEqual({ par: 4, handicap: 1, yardage: 0 })
    expect(holes[8].handicap).toBe(9)
  })
})

describe('validateManualCourse', () => {
  it('accepts a well-formed course', () => {
    expect(validateManualCourse(input())).toEqual({})
    expect(isManualCourseValid(input())).toBe(true)
  })

  it('requires a club name and a tee name', () => {
    expect(validateManualCourse(input({ clubName: '  ' })).clubName).toBeDefined()
    expect(validateManualCourse(input({ teeName: '' })).teeName).toBeDefined()
  })

  it('requires 9 or 18 holes', () => {
    expect(validateManualCourse(input({ holes: blankHoles(12) })).holes).toBeDefined()
    expect(validateManualCourse(input({ holes: blankHoles(9) }))).toEqual({})
  })

  it('rejects out-of-range, non-finite, or fractional par', () => {
    const holes = blankHoles(9)
    holes[3].par = 9
    expect(validateManualCourse(input({ holes })).holes).toBeDefined()
    holes[3].par = NaN
    expect(validateManualCourse(input({ holes })).holes).toBeDefined()
    holes[3].par = 3.5 // fractional par would corrupt par-total / vs-par math
    expect(validateManualCourse(input({ holes })).holes).toBeDefined()
  })
})

describe('isManualCourseId', () => {
  it('recognizes the manual-N form', () => {
    expect(isManualCourseId('manual-1')).toBe(true)
    expect(isManualCourseId('manual-42')).toBe(true)
  })
  it('recognizes legacy negative ids (number and migrated string forms)', () => {
    expect(isManualCourseId(-1)).toBe(true)
    expect(isManualCourseId('-1')).toBe(true) // after the v3 key-stringify migration
  })
  it('treats opaque API slugs and numeric API ids as not-manual', () => {
    expect(isManualCourseId('yasc0cpx')).toBe(false)
    expect(isManualCourseId('34')).toBe(false)
    expect(isManualCourseId(34)).toBe(false)
  })
})

describe('nextManualCourseId', () => {
  it('starts at manual-1 and steps above the highest existing manual number', () => {
    expect(nextManualCourseId([])).toBe('manual-1')
    expect(nextManualCourseId(['yasc0cpx', '34'])).toBe('manual-1') // API (slug) ids ignored
    expect(nextManualCourseId(['manual-1', 'manual-2', 'yasc0cpx'])).toBe('manual-3')
    expect(nextManualCourseId([-1, -2])).toBe('manual-1') // legacy negative ids ignored
  })
})

describe('buildManualCourse', () => {
  it('produces an ApiCourse that the existing pipeline can consume', () => {
    const course = buildManualCourse(
      input({
        clubName: 'Sandy Pines',
        courseName: 'North',
        city: 'Rehoboth',
        state: 'DE',
        gender: 'male',
        teeName: 'White',
        holes: blankHoles(18),
      }),
      'manual-1',
    )
    expect(course.id).toBe('manual-1')
    expect(course.club_name).toBe('Sandy Pines')
    expect(course.location.city).toBe('Rehoboth')

    // Flows through the same helpers a real API course does.
    const tees = getTeeOptions(course)
    expect(tees).toHaveLength(1)
    expect(tees[0]).toMatchObject({ gender: 'male', teeName: 'White', numberOfHoles: 18 })
    expect(tees[0].parTotal).toBe(72) // 18 × par 4

    const tee = findTee(course, 'male', 'White')!
    expect(availableRoundLengths(tee.number_of_holes)).toEqual(['front9', 'back9', '18'])
    const holes = buildHoles(tee, '18')
    expect(holes).toHaveLength(18)
    expect(holes[0]).toEqual({ holeNumber: 1, par: 4, handicap: 1, yardage: 0 })
  })

  it('places a 9-hole womens course under tees.female and supports only Front 9', () => {
    const course = buildManualCourse(input({ gender: 'female', holes: blankHoles(9) }), 'manual-2')
    expect(course.tees.male).toHaveLength(0)
    expect(course.tees.female).toHaveLength(1)
    const tee = findTee(course, 'female', course.tees.female[0].tee_name)!
    expect(availableRoundLengths(tee.number_of_holes)).toEqual(['front9'])
    expect(buildHoles(tee, 'front9')).toHaveLength(9)
  })

  it('coerces non-finite or fractional optional hole fields to safe whole numbers', () => {
    const holes = blankHoles(9)
    holes[0] = { par: 4, handicap: NaN, yardage: NaN }
    holes[1] = { par: 4, handicap: 2.7, yardage: 315.6 }
    const course = buildManualCourse(input({ holes }), 'manual-1')
    const [h0, h1] = course.tees.male[0].holes
    expect(h0.handicap).toBe(1) // backfilled to hole number
    expect(h0.yardage).toBe(0)
    expect(h1.handicap).toBe(3) // rounded
    expect(h1.yardage).toBe(316) // rounded
  })
})
