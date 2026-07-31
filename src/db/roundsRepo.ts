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
    // Phase 2 sync bookkeeping. `dirty = 1` on every write (§5.2); the push
    // additionally filters to completed rounds (§11.11), so a dirty draft is
    // never actually pushed. `owner = 'local'` until an account adopts it.
    dirty: 1,
    owner: 'local',
  }
  await db.rounds.add(round)
  return round
}

/** Fetch a round by id, treating a soft-deleted (tombstoned) round as absent. */
export async function getRound(id: string): Promise<Round | undefined> {
  const round = await db.rounds.get(id)
  return round && !round.deletedAt ? round : undefined
}

/** Persist a round, refreshing derived totals and the updatedAt timestamp. */
export async function saveRound(round: Round): Promise<void> {
  const totals = computeTotals(round.holes)
  await db.rounds.put({
    ...round,
    totalScore: totals.totalScore,
    totalPar: totals.totalPar,
    updatedAt: new Date().toISOString(),
    dirty: 1,
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
    dirty: 1,
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
    dirty: 1,
  })
}

/** Update a round's free-text notes. */
export async function updateRoundNotes(id: string, notes: string): Promise<void> {
  await db.rounds.update(id, { notes, updatedAt: new Date().toISOString(), dirty: 1 })
}

/** All draft rounds, most-recently-updated first. Excludes tombstones. */
export async function getDraftRounds(): Promise<Round[]> {
  const drafts = await db.rounds.where('status').equals('draft').toArray()
  return drafts.filter((r) => !r.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** All completed rounds, newest first (by play date). Excludes tombstones. */
export async function getCompletedRounds(): Promise<Round[]> {
  const rounds = await db.rounds.where('status').equals('complete').toArray()
  return rounds.filter((r) => !r.deletedAt).sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * The most recent completed rounds, newest first. Backs the home-screen
 * "recent rounds" strip, which shows a short preview rather than the full list.
 */
export async function getRecentRounds(limit = 5): Promise<Round[]> {
  const rounds = await db.rounds.where('status').equals('complete').toArray()
  return rounds.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit - 1)
}

/** Count of live (non-tombstoned) rounds, for the Settings summary. */
export async function countRounds(): Promise<number> {
  return db.rounds.filter((r) => !r.deletedAt).count()
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
    dirty: 1,
  })
  await markCoursePlayed(round.courseId, new Date(round.date))
}

/**
 * Delete a round. A round that has ever been synced (or is account-owned) is
 * **soft-deleted** — a tombstone (`deletedAt` + `dirty`) that propagates the
 * delete to other devices (PHASE2.md §5.2). The tombstone is hidden from all
 * reads and retained locally until it is reaped after the 90-day TTL once it
 * has synced — see `reapTombstones` in the sync engine, which mirrors the
 * server's own TTL GC (§11.3). A never-synced, local-only round has nothing to
 * propagate to, so it is hard-deleted immediately — preserving the MVP's
 * behavior for the pure-local user and avoiding a tombstone that would linger
 * with no account to sync (and reap) it away.
 */
export async function deleteRound(id: string): Promise<void> {
  const round = await db.rounds.get(id)
  if (!round) return
  const neverSynced = round.version === undefined && (round.owner === undefined || round.owner === 'local')
  if (neverSynced) {
    await db.rounds.delete(id)
    return
  }
  await db.rounds.update(id, { deletedAt: new Date().toISOString(), dirty: 1 })
}
