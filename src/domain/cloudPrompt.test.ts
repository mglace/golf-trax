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
    isAuthenticated: false,
    completedCount: 1,
    prefs: undefined,
    ...over,
  }
}

function prefs(over: Partial<CloudPromptPrefs> = {}): CloudPromptPrefs {
  return { id: 'cloudPrompt', ...over }
}

describe('shouldPromptForCloud', () => {
  it('prompts at each milestone', () => {
    for (const n of CLOUD_PROMPT_MILESTONES) {
      expect(shouldPromptForCloud(input({ completedCount: n }))).toBe(true)
    }
  })

  it('stays quiet between milestones', () => {
    for (const n of [2, 4, 6, 7, 12]) {
      expect(shouldPromptForCloud(input({ completedCount: n }))).toBe(false)
    }
  })

  it('never fires again after the last milestone', () => {
    const last = CLOUD_PROMPT_MILESTONES[CLOUD_PROMPT_MILESTONES.length - 1]
    for (let n = last + 1; n <= last + 20; n++) {
      expect(shouldPromptForCloud(input({ completedCount: n }))).toBe(false)
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
