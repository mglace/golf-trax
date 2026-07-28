/**
 * A tiny module-level bridge so non-React code (e.g. the finalize handler) can
 * request a sync without threading auth through props. {@link SyncManager} keeps
 * the context current as auth changes; everything else just calls
 * {@link triggerSync}.
 */
import { sync, type GetToken } from './syncClient'
import { useSyncStore } from './syncStore'

let context: { getToken: GetToken; userId: string } | null = null

export function setSyncContext(getToken: GetToken, userId: string): void {
  context = { getToken, userId }
}

export function clearSyncContext(): void {
  context = null
}

/**
 * Fire-and-forget best-effort sync. No-op when signed out. When offline, sets
 * the status to "offline" rather than attempting a doomed request (§4, §6.5).
 */
export function triggerSync(): void {
  if (!context) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    useSyncStore.getState().setStatus('offline')
    return
  }
  void sync(context.getToken, context.userId)
}
