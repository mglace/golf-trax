/**
 * Repository for device-local UI preferences. Currently just the singleton
 * `cloudPrompt` row driving the post-save "save your rounds to the cloud?"
 * prompt (see `domain/cloudPrompt.ts`).
 *
 * Nothing in this table syncs — see {@link CloudPromptPrefs} for why it is kept
 * apart from the (synced) profile.
 */
import { db } from './db'
import type { CloudPromptPrefs } from './types'

const CLOUD_PROMPT_ID = 'cloudPrompt' as const

/** The stored prompt state, or undefined if the prompt has never been shown. */
export async function getCloudPromptPrefs(): Promise<CloudPromptPrefs | undefined> {
  return db.prefs.get(CLOUD_PROMPT_ID)
}

/**
 * Merge a patch into the singleton row, creating it if absent. `db.prefs.update`
 * is a no-op on a missing key, so read-then-put is what makes the first write
 * work.
 *
 * Transactional because that read-then-write is otherwise racy: two overlapping
 * calls can interleave and let the later `put` write a snapshot taken before the
 * earlier one's change, silently dropping it. Today's call sites are effectively
 * serialised, but IndexedDB is shared across tabs and this is an installable
 * PWA, so two tabs are enough to reach it.
 */
async function patch(changes: Partial<CloudPromptPrefs>): Promise<void> {
  await db.transaction('rw', db.prefs, async () => {
    const current = await db.prefs.get(CLOUD_PROMPT_ID)
    await db.prefs.put({ ...current, ...changes, id: CLOUD_PROMPT_ID })
  })
}

/**
 * Record that the prompt was shown at `completedCount` rounds, so that milestone
 * is never offered again. Written *before* the modal renders, so a user who
 * force-quits mid-prompt isn't re-prompted at the same count.
 */
export async function recordCloudPromptShown(completedCount: number): Promise<void> {
  await patch({ lastPromptedCount: completedCount })
}

/** "Don't ask again" — suppress the prompt permanently on this device. */
export async function dismissCloudPromptForever(): Promise<void> {
  await patch({ dismissedForever: true })
}

/**
 * Flag that a sign-in redirect is in flight (set) or has been acknowledged by
 * the Home banner (cleared).
 */
export async function setPendingSignIn(pending: boolean): Promise<void> {
  await patch({ pendingSignIn: pending })
}
