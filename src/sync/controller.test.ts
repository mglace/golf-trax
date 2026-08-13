import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSyncContext, clearSyncContext, triggerSync, backoffDelay } from './controller'
import { useSyncStore } from './syncStore'
import { sync } from './syncClient'

/**
 * Unit tests for the sync trigger bridge + retry/backoff (PHASE2.md §8.3). The
 * engine itself is stubbed so we can drive each terminal status deterministically
 * and assert the controller's scheduling decisions with fake timers.
 */

vi.mock('./syncClient', () => ({ sync: vi.fn() }))

const mockedSync = vi.mocked(sync)
const getToken = async () => 'test-token'

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  // Default to online; individual tests override to exercise the offline branch.
  vi.stubGlobal('navigator', { onLine: true })
  useSyncStore.setState({ status: 'signed-out', lastSyncedAt: null })
})

afterEach(() => {
  // Clear any pending retry timer + module-level context between tests.
  clearSyncContext()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('triggerSync gating', () => {
  it('is a no-op when signed out (no context)', () => {
    clearSyncContext()
    triggerSync()
    expect(mockedSync).not.toHaveBeenCalled()
  })

  it('short-circuits to "offline" without a network attempt when offline', () => {
    vi.stubGlobal('navigator', { onLine: false })
    setSyncContext(getToken, 'auth0|matt')
    triggerSync()
    expect(useSyncStore.getState().status).toBe('offline')
    expect(mockedSync).not.toHaveBeenCalled()
  })
})

describe('retry/backoff', () => {
  it('retries an error on an exponential, capped schedule', async () => {
    mockedSync.mockResolvedValue('error')
    setSyncContext(getToken, 'auth0|matt')

    triggerSync()
    await vi.advanceTimersByTimeAsync(0) // flush the .then → schedule the first retry
    expect(mockedSync).toHaveBeenCalledTimes(1)

    // Nothing fires before the 5s base delay…
    await vi.advanceTimersByTimeAsync(4999)
    expect(mockedSync).toHaveBeenCalledTimes(1)
    // …then the first retry (backoffDelay(0) = 5s).
    await vi.advanceTimersByTimeAsync(1)
    expect(mockedSync).toHaveBeenCalledTimes(2)

    // Second retry waits the doubled delay (backoffDelay(1) = 10s).
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mockedSync).toHaveBeenCalledTimes(3)
  })

  it.each(['paused', 'synced', 'offline'] as const)(
    'does not schedule a retry after "%s"',
    async (status) => {
      mockedSync.mockResolvedValue(status)
      setSyncContext(getToken, 'auth0|matt')

      triggerSync()
      await vi.advanceTimersByTimeAsync(0)
      expect(mockedSync).toHaveBeenCalledTimes(1)

      // A long wait proves the controller is waiting for a passive trigger, not
      // hot-looping (critical for "paused" against an unrefreshable token).
      await vi.advanceTimersByTimeAsync(600_000)
      expect(mockedSync).toHaveBeenCalledTimes(1)
    },
  )

  it('cancels a pending retry once a later sync succeeds', async () => {
    mockedSync.mockResolvedValueOnce('error')
    setSyncContext(getToken, 'auth0|matt')

    triggerSync()
    await vi.advanceTimersByTimeAsync(0) // an error retry is now pending

    // A subsequent successful trigger should clear it.
    mockedSync.mockResolvedValue('synced')
    triggerSync()
    await vi.advanceTimersByTimeAsync(0)
    const callsAfterSuccess = mockedSync.mock.calls.length

    await vi.advanceTimersByTimeAsync(60_000)
    expect(mockedSync).toHaveBeenCalledTimes(callsAfterSuccess) // no stale retry fired
  })
})

describe('backoffDelay', () => {
  it('doubles from a 5s base and caps at 5min', () => {
    expect(backoffDelay(0)).toBe(5_000)
    expect(backoffDelay(1)).toBe(10_000)
    expect(backoffDelay(2)).toBe(20_000)
    expect(backoffDelay(5)).toBe(160_000)
    expect(backoffDelay(6)).toBe(300_000) // 320s would exceed the cap
    expect(backoffDelay(20)).toBe(300_000)
  })
})
