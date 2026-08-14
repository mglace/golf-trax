/**
 * When to offer the "save your rounds to the cloud?" prompt after a round is
 * saved (`features/onboarding/CloudPromptModal`).
 *
 * Pure — no Dexie, no React, no network — so the cadence rules are unit-tested
 * in isolation, matching the rest of `src/domain/`.
 *
 * The prompt is the only place the core on-course flow mentions accounts; before
 * it existed, sync was discoverable only via Settings → Account & sync. It stays
 * an invitation, never a gate: the round is already finalized and saved locally
 * before this is ever consulted, and declining costs the user nothing.
 */
import type { CloudPromptPrefs } from '@/db/types'

/**
 * Completed-round counts at which the prompt is offered.
 *
 * One ask at the first round (when the user has something worth keeping), then
 * two spaced re-asks for people who weren't ready yet. After the last milestone
 * the prompt never fires on its own again — Settings remains the permanent entry
 * point, so a declined offer is never a dead end.
 */
export const CLOUD_PROMPT_MILESTONES: readonly number[] = [1, 3, 5]

export interface CloudPromptInput {
  /** Whether this build has Auth0 configured at all (`auth/authConfig.ts`). */
  isConfigured: boolean
  /**
   * Auth0 is still restoring a cached session, so `isAuthenticated` is not yet
   * trustworthy — it reads `false` for a signed-in user until the SDK settles.
   */
  isLoading: boolean
  isAuthenticated: boolean
  /** Live completed rounds on this device, measured *after* the save. */
  completedCount: number
  /** Stored prompt state; undefined until the prompt has been shown once. */
  prefs: CloudPromptPrefs | undefined
}

/** Whether to show the cloud prompt for a just-saved round. */
export function shouldPromptForCloud({
  isConfigured,
  isLoading,
  isAuthenticated,
  completedCount,
  prefs,
}: CloudPromptInput): boolean {
  // A local-only build has no account surface at all, and a signed-in user has
  // nothing to be offered. While the session is still resolving we can't tell
  // the two apart, so hold: prompting there would both show a signed-in user a
  // sign-in modal and burn the milestone below on someone who never saw it.
  if (!isConfigured || isLoading || isAuthenticated) return false
  if (prefs?.dismissedForever) return false
  if (!CLOUD_PROMPT_MILESTONES.includes(completedCount)) return false
  // Milestones only ever move forward. Matching on the exact count would re-open
  // an earlier one if the library shrinks — delete every round after being asked
  // at 3, save a new one, and count 1 would ask again despite already being
  // declined. Anything at or below the last ask stays closed.
  if (prefs?.lastPromptedCount !== undefined && completedCount <= prefs.lastPromptedCount) {
    return false
  }
  return true
}

/**
 * Whether this is a repeat showing. Drives the "Don't ask again" escape hatch,
 * which is withheld on the very first ask so the initial offer stays a simple
 * yes/not-now.
 */
export function isRepeatCloudPrompt(prefs: CloudPromptPrefs | undefined): boolean {
  return prefs?.lastPromptedCount !== undefined
}
