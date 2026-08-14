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
  isAuthenticated: boolean
  /** Live completed rounds on this device, measured *after* the save. */
  completedCount: number
  /** Stored prompt state; undefined until the prompt has been shown once. */
  prefs: CloudPromptPrefs | undefined
}

/** Whether to show the cloud prompt for a just-saved round. */
export function shouldPromptForCloud({
  isConfigured,
  isAuthenticated,
  completedCount,
  prefs,
}: CloudPromptInput): boolean {
  // A local-only build has no account surface at all, and a signed-in user has
  // nothing to be offered.
  if (!isConfigured || isAuthenticated) return false
  if (prefs?.dismissedForever) return false
  if (!CLOUD_PROMPT_MILESTONES.includes(completedCount)) return false
  // Never re-offer the same milestone — e.g. after deleting a round and saving
  // another, which walks the count back over a milestone it already passed.
  return prefs?.lastPromptedCount !== completedCount
}

/**
 * Whether this is a repeat showing. Drives the "Don't ask again" escape hatch,
 * which is withheld on the very first ask so the initial offer stays a simple
 * yes/not-now.
 */
export function isRepeatCloudPrompt(prefs: CloudPromptPrefs | undefined): boolean {
  return prefs?.lastPromptedCount !== undefined
}
