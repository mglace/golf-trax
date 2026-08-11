import { describe, it, expect } from 'vitest'
import { toRoutePattern } from './routePath'

describe('toRoutePattern', () => {
  it('passes fixed routes through unchanged', () => {
    expect(toRoutePattern('/')).toBe('/')
    expect(toRoutePattern('/rounds')).toBe('/rounds')
    expect(toRoutePattern('/stats')).toBe('/stats')
    expect(toRoutePattern('/settings')).toBe('/settings')
    expect(toRoutePattern('/new')).toBe('/new')
    expect(toRoutePattern('/new/manual')).toBe('/new/manual')
  })

  it('collapses the round id in focused flows', () => {
    expect(toRoutePattern('/round/abc-123')).toBe('/round/:roundId')
    expect(toRoutePattern('/round/8f1e2d3c-0000-4a1b-9c2d-abcdef012345')).toBe('/round/:roundId')
  })

  it('collapses the round summary route', () => {
    expect(toRoutePattern('/round/abc-123/summary')).toBe('/round/:roundId/summary')
  })

  it('collapses the course id but keeps the manual route literal', () => {
    expect(toRoutePattern('/new/12345')).toBe('/new/:courseId')
    expect(toRoutePattern('/new/manual')).toBe('/new/manual')
  })

  it('normalizes trailing slashes without collapsing the root', () => {
    expect(toRoutePattern('/rounds/')).toBe('/rounds')
    expect(toRoutePattern('/')).toBe('/')
  })

  it('never leaks an opaque id in the returned pattern', () => {
    const id = 'a1b2c3d4-secret-uuid'
    expect(toRoutePattern(`/round/${id}`)).not.toContain(id)
    expect(toRoutePattern(`/round/${id}/summary`)).not.toContain(id)
    expect(toRoutePattern(`/new/${id}`)).not.toContain(id)
  })
})
