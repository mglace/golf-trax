/**
 * Pure serialization + validation for local-data backups.
 *
 * The MVP stores everything on-device (IndexedDB), so a cleared browser means
 * total data loss. A backup is a single JSON document the user can download and
 * re-import — on the same device or a new one — to restore their rounds,
 * cached courses, and profile.
 *
 * This module is deliberately free of any Dexie/IndexedDB dependency so the
 * envelope shape and, more importantly, the *validation* of untrusted imported
 * JSON can be unit-tested in isolation. The Dexie read/write wrappers live in
 * `@/db/backup`.
 */
import type { CachedCourse, HoleEntry, Profile, Round, RoundLength, RoundStatus } from '@/db/types'

/** Identifies a JSON blob as a GolfTrax backup (guards against importing junk). */
export const BACKUP_APP = 'golftrax' as const
/**
 * Backup envelope version. Bump when the persisted shape changes in a way that
 * needs migration on import; `parseBackup` rejects versions it doesn't know.
 */
export const BACKUP_SCHEMA_VERSION = 1 as const

export interface BackupData {
  courses: CachedCourse[]
  rounds: Round[]
  profile: Profile | null
}

export interface Backup {
  app: typeof BACKUP_APP
  schemaVersion: number
  /** ISO timestamp the backup was produced. */
  exportedAt: string
  data: BackupData
}

/** Thrown by {@link parseBackup} when a blob can't be read as a GolfTrax backup. */
export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

/** Records that survived validation, plus counts of anything skipped. */
export interface ParsedBackup {
  backup: Backup
  /** Number of records dropped because they were structurally invalid. */
  skipped: { courses: number; rounds: number }
}

/** Wrap already-loaded records in a versioned envelope for download. */
export function buildBackup(data: BackupData, exportedAt: string): Backup {
  return {
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    data: {
      courses: data.courses,
      rounds: data.rounds,
      profile: data.profile,
    },
  }
}

const ROUND_LENGTHS: RoundLength[] = ['front9', 'back9', '18']
const ROUND_STATUSES: RoundStatus[] = ['draft', 'complete']

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Normalize an imported course id to a non-empty string, tolerating a legacy
 * finite number (older exports stored manual-course ids as negative numbers).
 * Returns null when the value can't be a valid id.
 */
function coerceCourseId(v: unknown): string | null {
  if (typeof v === 'string') return v === '' ? null : v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}

/**
 * Validate a single round from imported (untrusted) JSON. Returns the round if
 * it has the required, correctly-typed fields; otherwise null (caller skips
 * and counts it). Optional fields are passed through without deep validation —
 * the goal is to reject data that would corrupt the store or crash the UI, not
 * to re-derive every field.
 */
/**
 * Sanitize a single hole from imported JSON. The four snapshotted fields
 * (holeNumber, par, handicap, yardage) are required and must be finite numbers;
 * a hole missing any of them is corrupt and rejected (→ its whole round is
 * skipped). Optional fields are coerced: non-finite score/putts and non-boolean
 * fairwayHit/gir are dropped rather than passed through, so a string like
 * `score: "5"` can never reach the scorecard/stats math as NaN.
 */
function sanitizeHole(h: unknown): HoleEntry | null {
  if (!isObject(h)) return null
  const { holeNumber, par, handicap, yardage, score, fairwayHit, putts, gir } = h
  if (!Number.isFinite(holeNumber)) return null
  if (!Number.isFinite(par)) return null
  if (!Number.isFinite(handicap)) return null
  if (!Number.isFinite(yardage)) return null
  const clean: HoleEntry = {
    holeNumber: holeNumber as number,
    par: par as number,
    handicap: handicap as number,
    yardage: yardage as number,
  }
  if (Number.isFinite(score)) clean.score = score as number
  if (typeof fairwayHit === 'boolean') clean.fairwayHit = fairwayHit
  if (Number.isFinite(putts)) clean.putts = putts as number
  if (typeof gir === 'boolean') clean.gir = gir
  return clean
}

function validateRound(v: unknown): Round | null {
  if (!isObject(v)) return null
  const {
    id,
    courseId: rawCourseId,
    courseName,
    clubName,
    gender,
    teeName,
    roundLength,
    status,
    date,
    holes,
    updatedAt,
  } = v
  if (typeof id !== 'string' || id === '') return null
  // courseId is an opaque string; coerce a legacy finite number (older exports
  // held numeric manual-course ids) rather than dropping the round.
  const courseId = coerceCourseId(rawCourseId)
  if (courseId === null) return null
  if (typeof courseName !== 'string') return null
  if (typeof clubName !== 'string') return null
  if (gender !== 'male' && gender !== 'female') return null
  if (typeof teeName !== 'string') return null
  if (!ROUND_LENGTHS.includes(roundLength as RoundLength)) return null
  if (!ROUND_STATUSES.includes(status as RoundStatus)) return null
  if (typeof date !== 'string') return null
  if (!Array.isArray(holes)) return null

  // Sanitize every hole; a single corrupt hole invalidates the round so we
  // never persist a partially-broken scorecard.
  const cleanHoles: HoleEntry[] = []
  for (const h of holes) {
    const clean = sanitizeHole(h)
    if (!clean) return null
    cleanHoles.push(clean)
  }

  // updatedAt was added alongside drafts; tolerate older exports missing it.
  const round: Round = {
    ...(v as unknown as Round),
    courseId, // coerced to string above (may have been a legacy number)
    holes: cleanHoles,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : date,
  }
  // Derived totals are recomputed on save, but imports bulkPut as-is — drop
  // non-numeric totals so corrupt values can't reach history display.
  if (!Number.isFinite(round.totalScore)) delete round.totalScore
  if (!Number.isFinite(round.totalPar)) delete round.totalPar

  // Phase 2 sync bookkeeping (§11.10): backups DO include tombstones for
  // fidelity, so import must tolerate them — but sanitize each field so a
  // hand-edited or older backup can't inject a bad type via the spread above.
  round.dirty = v.dirty === 1 ? 1 : 0
  round.owner = typeof v.owner === 'string' ? v.owner : 'local'
  if (typeof v.deletedAt === 'string') round.deletedAt = v.deletedAt
  else delete round.deletedAt
  if (Number.isFinite(v.version)) round.version = v.version as number
  else delete round.version
  if (typeof v.serverUpdatedAt === 'string') round.serverUpdatedAt = v.serverUpdatedAt
  else delete round.serverUpdatedAt
  return round
}

/** Validate a single cached course from imported JSON. */
function validateCourse(v: unknown): CachedCourse | null {
  if (!isObject(v)) return null
  // Course ids are opaque strings; coerce a legacy finite number (older exports
  // held numeric manual-course ids) rather than dropping the course.
  const id = coerceCourseId(v.id)
  if (id === null) return null
  // `cachedAt` was always written on cache; backfill for resilience.
  return {
    ...(v as unknown as CachedCourse),
    id,
    cachedAt: typeof v.cachedAt === 'string' ? v.cachedAt : new Date(0).toISOString(),
  }
}

function validateProfile(v: unknown): Profile | null {
  if (!isObject(v)) return null
  if (v.id !== 'profile') return null
  return {
    id: 'profile',
    name: typeof v.name === 'string' ? v.name : undefined,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : undefined,
  }
}

/**
 * Parse and validate a backup document from raw text (e.g. an uploaded file).
 *
 * Throws {@link BackupError} with a user-facing message for problems that make
 * the whole file unusable (not JSON, not a GolfTrax backup, unsupported
 * version, missing data section). Individual malformed course/round records are
 * dropped rather than aborting the import, and reported via `skipped`.
 */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError("This file isn't valid JSON, so it can't be a GolfTrax backup.")
  }
  if (!isObject(raw)) throw new BackupError('This file is not a valid GolfTrax backup.')
  if (raw.app !== BACKUP_APP) {
    throw new BackupError('This file is not a GolfTrax backup.')
  }
  if (typeof raw.schemaVersion !== 'number' || raw.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new BackupError(
      'This backup was made by a newer version of GolfTrax. Please update the app and try again.',
    )
  }
  if (!isObject(raw.data)) {
    throw new BackupError('This backup is missing its data section.')
  }

  const rawCourses = Array.isArray(raw.data.courses) ? raw.data.courses : []
  const rawRounds = Array.isArray(raw.data.rounds) ? raw.data.rounds : []

  const courses: CachedCourse[] = []
  let skippedCourses = 0
  for (const c of rawCourses) {
    const valid = validateCourse(c)
    if (valid) courses.push(valid)
    else skippedCourses++
  }

  const rounds: Round[] = []
  let skippedRounds = 0
  for (const r of rawRounds) {
    const valid = validateRound(r)
    if (valid) rounds.push(valid)
    else skippedRounds++
  }

  const profile = validateProfile(raw.data.profile)

  return {
    backup: {
      app: BACKUP_APP,
      schemaVersion: raw.schemaVersion,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
      data: { courses, rounds, profile },
    },
    skipped: { courses: skippedCourses, rounds: skippedRounds },
  }
}

/** Suggested download filename, e.g. `golftrax-backup-2026-07-28.json`. */
export function backupFilename(exportedAt: string): string {
  const datePart = exportedAt.slice(0, 10) || 'export'
  return `golftrax-backup-${datePart}.json`
}
