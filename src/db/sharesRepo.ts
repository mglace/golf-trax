/**
 * Dexie access for published share links. Features never touch `db.shares`
 * directly (same convention as `roundsRepo` / `coursesRepo`).
 *
 * Shares are purely local bookkeeping — they never sync. The record exists so a
 * round that has already been shared reuses its link instead of minting a new
 * one on every reopen, and so the revoke token survives a page reload.
 */
import { db } from './db'
import type { ShareRecord } from './types'

/** The share link for a round, or undefined if it has never been shared. */
export async function getShareForRound(roundId: string): Promise<ShareRecord | undefined> {
  return db.shares.get(roundId)
}

/** Persist a newly created share link. */
export async function saveShare(record: ShareRecord): Promise<void> {
  await db.shares.put(record)
}

/** Forget a share locally (after revoking it, or when its round is deleted). */
export async function deleteShare(roundId: string): Promise<void> {
  await db.shares.delete(roundId)
}
