import { describe, it, expect } from 'vitest'
import { isChunkLoadError } from './isChunkLoadError'

describe('isChunkLoadError', () => {
  it('matches the message each engine throws for a failed dynamic import', () => {
    // Chromium
    expect(
      isChunkLoadError(
        new TypeError(
          'Failed to fetch dynamically imported module: https://app.test/assets/StatsPage-abc123.js',
        ),
      ),
    ).toBe(true)
    // Firefox
    expect(
      isChunkLoadError(
        new TypeError(
          'error loading dynamically imported module: https://app.test/assets/StatsPage-abc123.js',
        ),
      ),
    ).toBe(true)
    // Safari
    expect(
      isChunkLoadError(new TypeError('Importing a module script failed.')),
    ).toBe(true)
  })

  it('matches an error tagged with the ChunkLoadError name', () => {
    const err = new Error('loading chunk 5 failed')
    err.name = 'ChunkLoadError'
    expect(isChunkLoadError(err)).toBe(true)
  })

  it('does NOT match a genuine render error', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of null (reading 'par')"))).toBe(
      false,
    )
    expect(isChunkLoadError(new Error('render blew up'))).toBe(false)
  })

  it('does NOT match non-Error values', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
    expect(isChunkLoadError({ message: 'importing a module script failed' })).toBe(false)
  })
})
