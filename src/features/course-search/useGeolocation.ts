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
  request: () => void
}

const SUPPORTED = typeof navigator !== 'undefined' && 'geolocation' in navigator

export function useGeolocation(): GeolocationState {
  const [status, setStatus] = useState<GeoStatus>(SUPPORTED ? 'idle' : 'unsupported')
  const [coords, setCoords] = useState<Coords | null>(null)

  const request = useCallback(() => {
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
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }, [])

  return { status, coords, request }
}
