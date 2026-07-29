/**
 * Dexie access for the singleton sync-cursor row (PHASE2.md §5.2). Kept thin
 * and separate from the reconciliation logic so the pure module stays testable.
 */
import { db } from '@/db/db'
import type { SyncState } from '@/db/types'

const ID = 'sync' as const

/** The current sync cursor + account, defaulting to a fresh/local-only state. */
export async function getSyncState(): Promise<SyncState> {
  const s = await db.syncState.get(ID)
  return s ?? { id: ID, lastPulledTs: 0, userId: null }
}

/**
 * Point the sync engine at an account. Switching accounts (or signing in for
 * the first time) resets the pull cursor to 0 so the new account's full data
 * set is pulled rather than trusting a cursor from a different data set.
 */
export async function setSyncUser(userId: string | null): Promise<void> {
  const s = await getSyncState()
  if (s.userId === userId) return
  await db.syncState.put({ id: ID, userId, lastPulledTs: 0 })
}
