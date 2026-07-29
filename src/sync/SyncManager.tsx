/**
 * Headless component (mounted once in the app shell) that wires the sync
 * triggers from PHASE2.md §6.5: on login, on regaining connectivity, and on a
 * light foreground interval. Finalize-time sync is triggered directly from the
 * summary page via {@link triggerSync}. Renders nothing.
 *
 * Entirely inert when sync is unconfigured or the user is signed out.
 */
import { useEffect, useRef } from 'react'
import { useAuth } from '@/auth/authContext'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { setSyncContext, clearSyncContext, triggerSync } from './controller'
import { prepareMerge, type GetToken } from './syncClient'
import { setSyncUser } from './syncState'
import { useSyncStore } from './syncStore'

const INTERVAL_MS = 60_000

export function SyncManager() {
  const { isConfigured, isAuthenticated, userId, getToken } = useAuth()
  const online = useOnlineStatus()
  const setStatus = useSyncStore((s) => s.setStatus)

  // Keep the latest getToken behind a stable ref so the auth effect below is
  // keyed on identity (userId), not on getToken churn.
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  // Auth lifecycle: point the engine at the account, run the first-login merge,
  // and do an initial sync (§6.4, §6.5).
  useEffect(() => {
    if (!isConfigured) return
    if (!isAuthenticated || !userId) {
      clearSyncContext()
      setStatus('signed-out')
      return
    }
    const stableGetToken: GetToken = () => getTokenRef.current()
    setSyncContext(stableGetToken, userId)
    let cancelled = false
    void (async () => {
      await setSyncUser(userId)
      await prepareMerge()
      if (!cancelled) triggerSync()
    })()
    return () => {
      cancelled = true
    }
  }, [isConfigured, isAuthenticated, userId, setStatus])

  // Connectivity transitions: sync on regain, show "offline" on loss.
  useEffect(() => {
    if (!isConfigured || !isAuthenticated || !userId) return
    if (online) triggerSync()
    else setStatus('offline')
  }, [online, isConfigured, isAuthenticated, userId, setStatus])

  // Light foreground interval.
  useEffect(() => {
    if (!isConfigured || !isAuthenticated || !userId) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') triggerSync()
    }, INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [isConfigured, isAuthenticated, userId])

  return null
}
