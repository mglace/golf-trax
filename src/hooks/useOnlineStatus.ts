import { useEffect, useState } from 'react'

/**
 * Tracks browser connectivity via `navigator.onLine` and the `online`/`offline`
 * events. Used to proactively tell the user when a network-dependent action
 * (course search) won't work, rather than waiting for a request to fail.
 *
 * `navigator.onLine` is a best-effort signal — it reports link-layer
 * connectivity, not whether a given host is actually reachable — so the
 * reactive {@link ApiError} handling in the fetch layer remains the source of
 * truth for real request failures. This hook only drives the heads-up UI.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    // Re-sync in case connectivity changed between initial render and effect.
    setOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
