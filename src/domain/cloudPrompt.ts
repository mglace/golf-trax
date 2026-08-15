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

const LAST_MILESTONE = CLOUD_PROMPT_MILESTONES[CLOUD_PROMPT_MILESTONES.length - 1]

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

/**
 * The auth-only half of the decision, separated so callers can check it *before*
 * paying for the round count and prefs that {@link shouldPromptForCloud} needs —
 * `countCompletedRounds()` is not a cheap query (see its doc), and on a
 * local-only build or for a signed-in user the answer is always no.
 *
 * A local-only build has no account surface at all, and a signed-in user has
 * nothing to be offered. While the session is still resolving we can't tell the
 * two apart, so hold: prompting there would both show a signed-in user a
 * sign-in modal and burn a milestone on someone who never saw it.
 */
export function canPromptForCloud(auth: {
  isConfigured: boolean
  isLoading: boolean
  isAuthenticated: boolean
}): boolean {
  return auth.isConfigured && !auth.isLoading && !auth.isAuthenticated
}

/** Whether to show the cloud prompt for a just-saved round. */
export function shouldPromptForCloud({
  isConfigured,
  isLoading,
  isAuthenticated,
  completedCount,
  prefs,
}: CloudPromptInput): boolean {
  if (!canPromptForCloud({ isConfigured, isLoading, isAuthenticated })) return false
  if (prefs?.dismissedForever) return false

  const lastPrompted = prefs?.lastPromptedCount

  // Catch-up for a library that is already past the last milestone on a device
  // that has never been asked. The milestones are exact counts, so without this
  // anyone who had 6+ rounds when the prompt shipped would sail past 7, 8, …
  // and never be offered an account — and they are precisely the people this
  // exists for: long-time players who never opened Settings. One ask, then the
  // rules below take over, because the caller stamps `lastPromptedCount`.
  if (lastPrompted === undefined && completedCount > LAST_MILESTONE) return true

  if (!CLOUD_PROMPT_MILESTONES.includes(completedCount)) return false
  // Milestones only ever move forward. Matching on the exact count would re-open
  // an earlier one if the library shrinks — delete every round after being asked
  // at 3, save a new one, and count 1 would ask again despite already being
  // declined. Anything at or below the last ask stays closed.
  if (lastPrompted !== undefined && completedCount <= lastPrompted) return false
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
