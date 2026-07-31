import { useCallback, useState } from 'react'
import type { Coords } from '@/domain/geo'

/**
 * Thin wrapper over the browser Geolocation API for the "near you" feature.
 * Kept out of the pure `domain/geo` module (which stays testable). The user
 * must explicitly request their location — we never read it on mount.
 */
export type GeoStatus = 'unsupported' | 'idle' | 'prompting' | 'granted' | 'denied' | 'error'

export interface GeolocationState {
  status: GeoStatus
  coords: Coords | null
  /**
   * Read the user's location. Pass `{ fresh: true }` to force a brand-new fix
   * (e.g. an explicit "update location" tap after the user has moved); the
   * default reuses a cached fix up to 5 minutes old to stay fast on first read.
   */
  request: (opts?: { fresh?: boolean }) => void
}

const SUPPORTED = typeof navigator !== 'undefined' && 'geolocation' in navigator

export function useGeolocation(): GeolocationState {
  const [status, setStatus] = useState<GeoStatus>(SUPPORTED ? 'idle' : 'unsupported')
  const [coords, setCoords] = useState<Coords | null>(null)

  const request = useCallback((opts?: { fresh?: boolean }) => {
    if (!SUPPORTED) {
      setStatus('unsupported')
      return
    }
    setStatus('prompting')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setStatus('granted')
      },
      (err) => {
        // PERMISSION_DENIED === 1; anything else (position unavailable, timeout)
        // is a transient error the user can retry.
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error')
      },
      // A fresh request bypasses the cached fix so "update location" actually moves.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: opts?.fresh ? 0 : 300_000 },
    )
  }, [])

  return { status, coords, request }
}
