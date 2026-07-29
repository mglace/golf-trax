/**
 * A tiny module-level bridge so non-React code (e.g. the finalize handler) can
 * request a sync without threading auth through props. {@link SyncManager} keeps
 * the context current as auth changes; everything else just calls
 * {@link triggerSync}.
 *
 * Also owns retry/backoff (PHASE2.md §8.3): a failed sync schedules an
 * exponential-backoff retry (5s → 5min cap); any success or explicit trigger
 * cancels the pending retry.
 */
import { sync, type GetToken } from './syncClient'
import { useSyncStore } from './syncStore'

let context: { getToken: GetToken; userId: string } | null = null

const RETRY_BASE_MS = 5_000
const RETRY_CAP_MS = 300_000
const RETRY_MAX_ATTEMPT = 6
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryAttempt = 0

/** Exponential backoff for retry attempt `n` (0-based), capped. */
export function backoffDelay(attempt: number): number {
  return Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** attempt)
}

function cancelRetry(): void {
  retryAttempt = 0
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

function scheduleRetry(): void {
  if (retryTimer) return // one pending retry at a time
  const delay = backoffDelay(retryAttempt)
  retryAttempt = Math.min(retryAttempt + 1, RETRY_MAX_ATTEMPT)
  retryTimer = setTimeout(() => {
    retryTimer = null
    triggerSync()
  }, delay)
}

export function setSyncContext(getToken: GetToken, userId: string): void {
  context = { getToken, userId }
}

export function clearSyncContext(): void {
  context = null
  cancelRetry()
}

/**
 * Fire-and-forget best-effort sync. No-op when signed out. When offline, sets
 * the status to "offline" rather than attempting a doomed request (§4, §6.5).
 * A transient failure schedules a backoff retry; success clears it.
 */
export function triggerSync(): void {
  if (!context) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    useSyncStore.getState().setStatus('offline')
    return
  }
  void sync(context.getToken, context.userId).then((status) => {
    // Only a hard error backs off; "paused" resumes via the online/interval
    // triggers once a token can be obtained again.
    if (status === 'error') scheduleRetry()
    else cancelRetry()
  })
}
