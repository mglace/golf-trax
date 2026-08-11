import { describe, it, expect, vi, afterEach } from 'vitest'
import { readAnalyticsConfig } from './config'

// The gating is the whole privacy story: analytics must stay inert unless a
// measurement id is set AND this is a production build. Exercise both rules
// through the exported reader (it reads import.meta.env at call time, so
// vi.stubEnv is enough — no module reset needed).
afterEach(() => vi.unstubAllEnvs())

describe('readAnalyticsConfig', () => {
  it('returns null when the measurement id is unset, even in production', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', '')
    expect(readAnalyticsConfig()).toBeNull()
  })

  it('returns null in non-production builds even with an id set', () => {
    vi.stubEnv('PROD', false)
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST1234')
    expect(readAnalyticsConfig()).toBeNull()
  })

  it('returns the config only when both an id and a production build are present', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST1234')
    expect(readAnalyticsConfig()).toEqual({ measurementId: 'G-TEST1234' })
  })
})
