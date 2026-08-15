import { describe, it, expect } from 'vitest'
import {
  CLOUD_PROMPT_MILESTONES,
  isRepeatCloudPrompt,
  shouldPromptForCloud,
  type CloudPromptInput,
} from './cloudPrompt'
import type { CloudPromptPrefs } from '@/db/types'

/** A signed-out user on a sync-enabled build who has never seen the prompt. */
function input(over: Partial<CloudPromptInput> = {}): CloudPromptInput {
  return {
    isConfigured: true,
    isLoading: false,
    isAuthenticated: false,
    completedCount: 1,
    prefs: undefined,
    ...over,
  }
}

function prefs(over: Partial<CloudPromptPrefs> = {}): CloudPromptPrefs {
  return { id: 'cloudPrompt', ...over }
}

const LAST = CLOUD_PROMPT_MILESTONES[CLOUD_PROMPT_MILESTONES.length - 1]

describe('shouldPromptForCloud', () => {
  it('prompts at each milestone', () => {
    for (const n of CLOUD_PROMPT_MILESTONES) {
      expect(shouldPromptForCloud(input({ completedCount: n }))).toBe(true)
    }
  })

  it('stays quiet between milestones', () => {
    for (const n of [2, 4]) {
      expect(shouldPromptForCloud(input({ completedCount: n }))).toBe(false)
    }
  })

  it('never fires again once the last milestone has been offered', () => {
    const p = prefs({ lastPromptedCount: LAST })
    for (let n = LAST + 1; n <= LAST + 20; n++) {
      expect(shouldPromptForCloud(input({ completedCount: n, prefs: p }))).toBe(false)
    }
  })

  it('is inert on a local-only build', () => {
    expect(shouldPromptForCloud(input({ isConfigured: false }))).toBe(false)
  })

  it('does not pester a signed-in user', () => {
    expect(shouldPromptForCloud(input({ isAuthenticated: true }))).toBe(false)
  })

  it('respects "Don\'t ask again" at every milestone', () => {
    for (const n of CLOUD_PROMPT_MILESTONES) {
      const p = prefs({ dismissedForever: true, lastPromptedCount: 1 })
      expect(shouldPromptForCloud(input({ completedCount: n, prefs: p }))).toBe(false)
    }
  })

  it('does not re-offer a milestone already shown', () => {
    const p = prefs({ lastPromptedCount: 3 })
    expect(shouldPromptForCloud(input({ completedCount: 3, prefs: p }))).toBe(false)
  })

  it('still offers a later milestone after an earlier one was declined', () => {
    const p = prefs({ lastPromptedCount: 1 })
    expect(shouldPromptForCloud(input({ completedCount: 3, prefs: p }))).toBe(true)
  })

  it('does not re-offer a milestone the count walks back over', () => {
    // Prompted at 3, user deletes a round (→ 2), then saves another (→ 3).
    const p = prefs({ lastPromptedCount: 3 })
    expect(shouldPromptForCloud(input({ completedCount: 2, prefs: p }))).toBe(false)
    expect(shouldPromptForCloud(input({ completedCount: 3, prefs: p }))).toBe(false)
  })

  it('does not re-open an earlier milestone when the library shrinks', () => {
    // Asked (and declined) at 3, then every round is deleted and a new one
    // saved. Count is back to 1 — a milestone, but one already spent.
    const p = prefs({ lastPromptedCount: 3 })
    expect(shouldPromptForCloud(input({ completedCount: 1, prefs: p }))).toBe(false)
    expect(shouldPromptForCloud(input({ completedCount: 0, prefs: p }))).toBe(false)
    // …but the milestone beyond the last ask is still available.
    expect(shouldPromptForCloud(input({ completedCount: 5, prefs: p }))).toBe(true)
  })

  describe('catch-up for libraries that predate the prompt', () => {
    it('offers once to a never-asked device already past the last milestone', () => {
      for (const n of [LAST + 1, 10, 250]) {
        expect(shouldPromptForCloud(input({ completedCount: n }))).toBe(true)
      }
    })

    it('does not repeat once that ask has been recorded', () => {
      // The catch-up fired at 7 and the caller stamped it; 8, 9, … stay quiet.
      const p = prefs({ lastPromptedCount: 7 })
      for (const n of [8, 9, 40]) {
        expect(shouldPromptForCloud(input({ completedCount: n, prefs: p }))).toBe(false)
      }
    })

    it('still respects the permanent opt-out', () => {
      const p = prefs({ dismissedForever: true })
      expect(shouldPromptForCloud(input({ completedCount: 30, prefs: p }))).toBe(false)
    })

    it('does not fire for a signed-in user or a local-only build', () => {
      expect(shouldPromptForCloud(input({ completedCount: 30, isAuthenticated: true }))).toBe(
        false,
      )
      expect(shouldPromptForCloud(input({ completedCount: 30, isConfigured: false }))).toBe(false)
      expect(shouldPromptForCloud(input({ completedCount: 30, isLoading: true }))).toBe(false)
    })

    it('leaves a device that declined an earlier milestone alone', () => {
      // Asked at 1 and declined, then grew past the last milestone — that's a
      // decline, not a device the prompt never reached.
      const p = prefs({ lastPromptedCount: 1 })
      expect(shouldPromptForCloud(input({ completedCount: 20, prefs: p }))).toBe(false)
    })
  })

  it('holds while Auth0 is still restoring a session', () => {
    // `isAuthenticated` reads false mid-restore, so without this a signed-in
    // user who cold-loads the summary and taps Save is shown a sign-in modal —
    // and the milestone is consumed on someone who should never have seen it.
    expect(shouldPromptForCloud(input({ isLoading: true }))).toBe(false)
    expect(shouldPromptForCloud(input({ isLoading: true, completedCount: 3 }))).toBe(false)
  })

  it('is quiet at zero rounds', () => {
    expect(shouldPromptForCloud(input({ completedCount: 0 }))).toBe(false)
  })
})

describe('isRepeatCloudPrompt', () => {
  it('is false before the prompt has ever been shown', () => {
    expect(isRepeatCloudPrompt(undefined)).toBe(false)
    expect(isRepeatCloudPrompt(prefs())).toBe(false)
  })

  it('is true once a milestone has been recorded', () => {
    expect(isRepeatCloudPrompt(prefs({ lastPromptedCount: 1 }))).toBe(true)
  })
})
