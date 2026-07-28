/**
 * Pure helpers for the history list: grouping rounds into relative date buckets
 * and formatting a round's date. `now` is passed in so this stays testable.
 */
import type { Round } from '@/db/types'

export interface RoundGroup {
  key: string
  label: string
  rounds: Round[]
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/**
 * Which relative bucket a round's date falls into. Weeks start on Sunday.
 * Order over time: This week → Last week → This month → "Month Year".
 */
export function bucketFor(dateISO: string, now: Date): { key: string; label: string } {
  const d = new Date(dateISO)
  const today = startOfDay(now)

  const startWeek = new Date(today)
  startWeek.setDate(today.getDate() - today.getDay()) // back to Sunday

  const startLastWeek = new Date(startWeek)
  startLastWeek.setDate(startWeek.getDate() - 7)

  const startMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  if (d >= startWeek) return { key: 'this-week', label: 'This week' }
  if (d >= startLastWeek) return { key: 'last-week', label: 'Last week' }
  if (d >= startMonth) return { key: 'this-month', label: 'This month' }

  const label = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(d)
  return { key: `m-${d.getFullYear()}-${d.getMonth()}`, label }
}

/**
 * Group rounds (assumed newest-first) into ordered date buckets. Because the
 * input is sorted descending and buckets are monotonic in time, first-seen
 * order yields the correct group order.
 */
export function groupRoundsByDate(rounds: Round[], now: Date): RoundGroup[] {
  const groups: RoundGroup[] = []
  const index = new Map<string, RoundGroup>()
  for (const r of rounds) {
    const { key, label } = bucketFor(r.date, now)
    let group = index.get(key)
    if (!group) {
      group = { key, label, rounds: [] }
      index.set(key, group)
      groups.push(group)
    }
    group.rounds.push(r)
  }
  return groups
}

/** Short date for a round card ("Jul 27", or "Jul 27, 2025" for other years). */
export function formatRoundDate(dateISO: string, now: Date): string {
  const d = new Date(dateISO)
  const sameYear = d.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat(
    undefined,
    sameYear
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' },
  ).format(d)
}
