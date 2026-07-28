/**
 * Repository for rounds (drafts + completed). Wraps Dexie access and keeps
 * derived totals in sync on write.
 */
import { db } from './db'
import { markCoursePlayed } from './coursesRepo'
import type { Gender, HoleEntry, Round, RoundLength } from './types'
import type { ApiCourse } from '@/api/types'
import { findTee, formatCourseName } from '@/domain/course'
import { buildHoles, computeTotals, deriveGir } from '@/domain/round'

/**
 * Create a new draft round from a course + selected tee + round length,
 * snapshotting per-hole par/handicap/yardage. Persists and returns it.
 */
export async function createDraftRound(
  course: ApiCourse,
  gender: Gender,
  teeName: string,
  roundLength: RoundLength,
): Promise<Round> {
  const tee = findTee(course, gender, teeName)
  if (!tee) throw new Error(`Tee not found: ${gender}/${teeName}`)

  const holes = buildHoles(tee, roundLength)
  if (holes.length === 0) throw new Error('Selected tee has no holes for this round length.')

  const now = new Date().toISOString()
  const totals = computeTotals(holes)
  const round: Round = {
    id: crypto.randomUUID(),
    courseId: course.id,
    courseName: formatCourseName(course),
    clubName: course.club_name,
    gender,
    teeName,
    roundLength,
    status: 'draft',
    date: now,
    holes,
    totalScore: totals.totalScore,
    totalPar: totals.totalPar,
    updatedAt: now,
  }
  await db.rounds.add(round)
  return round
}

export async function getRound(id: string): Promise<Round | undefined> {
  return db.rounds.get(id)
}

/** Persist a round, refreshing derived totals and the updatedAt timestamp. */
export async function saveRound(round: Round): Promise<void> {
  const totals = computeTotals(round.holes)
  await db.rounds.put({
    ...round,
    totalScore: totals.totalScore,
    totalPar: totals.totalPar,
    updatedAt: new Date().toISOString(),
  })
}

/** Patch a single hole within a round (used by auto-save). */
export async function updateRoundHoles(id: string, holes: HoleEntry[]): Promise<void> {
  const totals = computeTotals(holes)
  await db.rounds.update(id, {
    holes,
    totalScore: totals.totalScore,
    totalPar: totals.totalPar,
    updatedAt: new Date().toISOString(),
  })
}

/**
 * Patch a single hole in a round (by index), re-deriving GIR and refreshing
 * totals. Works on both drafts and finalized rounds (post-round editing).
 */
export async function updateHoleInRound(
  id: string,
  index: number,
  patch: Partial<HoleEntry>,
): Promise<void> {
  const round = await db.rounds.get(id)
  if (!round) throw new Error('Round not found')
  const holes = round.holes.map((h, i) => {
    if (i !== index) return h
    const merged: HoleEntry = { ...h, ...patch }
    merged.gir = deriveGir(merged.par, merged.score, merged.putts)
    return merged
  })
  const totals = computeTotals(holes)
  await db.rounds.update(id, {
    holes,
    totalScore: totals.totalScore,
    totalPar: totals.totalPar,
    updatedAt: new Date().toISOString(),
  })
}

/** Update a round's free-text notes. */
export async function updateRoundNotes(id: string, notes: string): Promise<void> {
  await db.rounds.update(id, { notes, updatedAt: new Date().toISOString() })
}

/** All draft rounds, most-recently-updated first. */
export async function getDraftRounds(): Promise<Round[]> {
  const drafts = await db.rounds.where('status').equals('draft').toArray()
  return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** All completed rounds, newest first (by play date). */
export async function getCompletedRounds(): Promise<Round[]> {
  const rounds = await db.rounds.where('status').equals('complete').toArray()
  return rounds.sort((a, b) => b.date.localeCompare(a.date))
}

/** Finalize a draft: mark complete, refresh totals, stamp the course as played. */
export async function finalizeRound(id: string): Promise<void> {
  const round = await db.rounds.get(id)
  if (!round) throw new Error('Round not found')
  const totals = computeTotals(round.holes)
  await db.rounds.update(id, {
    status: 'complete',
    totalScore: totals.totalScore,
    totalPar: totals.totalPar,
    updatedAt: new Date().toISOString(),
  })
  await markCoursePlayed(round.courseId, new Date(round.date))
}

export async function deleteRound(id: string): Promise<void> {
  await db.rounds.delete(id)
}
