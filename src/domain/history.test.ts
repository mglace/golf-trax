import { describe, it, expect } from 'vitest'
import { bucketFor, groupRoundsByDate, formatRoundDate } from './history'
import type { Round } from '@/db/types'

// Reference "now": Monday, July 27, 2026 (local). Week starts Sunday Jul 26.
const NOW = new Date(2026, 6, 27, 10, 0, 0)

function isoDaysAgo(days: number): string {
  const d = new Date(NOW)
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function round(dateISO: string, id = dateISO): Round {
  return {
    id,
    courseId: '1',
    courseName: 'Test',
    clubName: 'Test',
    gender: 'male',
    teeName: 'Blue',
    roundLength: '18',
    status: 'complete',
    date: dateISO,
    holes: [],
    updatedAt: dateISO,
  }
}

describe('bucketFor', () => {
  it('buckets today and yesterday (Sunday) as This week', () => {
    expect(bucketFor(isoDaysAgo(0), NOW).key).toBe('this-week') // Mon
    expect(bucketFor(isoDaysAgo(1), NOW).key).toBe('this-week') // Sun (week start)
  })

  it('buckets 2-8 days ago into Last week', () => {
    expect(bucketFor(isoDaysAgo(2), NOW).key).toBe('last-week') // Sat prior
    expect(bucketFor(isoDaysAgo(8), NOW).key).toBe('last-week') // Sun of last week
  })

  it('buckets earlier-this-month rounds as This month', () => {
    // July 5 is this month but before last week.
    expect(bucketFor(new Date(2026, 6, 5).toISOString(), NOW).key).toBe('this-month')
  })

  it('labels older rounds by month and year', () => {
    const b = bucketFor(new Date(2026, 4, 10).toISOString(), NOW)
    expect(b.key).toBe('m-2026-4')
    expect(b.label).toBe('May 2026')
  })
})

describe('groupRoundsByDate', () => {
  it('produces ordered groups without duplicates, newest first', () => {
    const rounds = [
      round(isoDaysAgo(0)), // this week
      round(isoDaysAgo(1)), // this week
      round(isoDaysAgo(3)), // last week
      round(new Date(2026, 6, 2).toISOString()), // this month
      round(new Date(2026, 3, 1).toISOString()), // April 2026
    ]
    const groups = groupRoundsByDate(rounds, NOW)
    expect(groups.map((g) => g.label)).toEqual([
      'This week',
      'Last week',
      'This month',
      'April 2026',
    ])
    expect(groups[0].rounds).toHaveLength(2)
  })

  it('returns an empty array for no rounds', () => {
    expect(groupRoundsByDate([], NOW)).toEqual([])
  })
})

describe('formatRoundDate', () => {
  it('omits the year for the current year', () => {
    expect(formatRoundDate(new Date(2026, 6, 27).toISOString(), NOW)).toBe('Jul 27')
  })
  it('includes the year for other years', () => {
    expect(formatRoundDate(new Date(2025, 6, 27).toISOString(), NOW)).toBe('Jul 27, 2025')
  })
})
