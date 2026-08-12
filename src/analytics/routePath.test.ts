import { describe, it, expect } from 'vitest'
import { toRoutePattern, toRouteTitle } from './routePath'

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

  describe('fail-closed fallback for unlisted routes', () => {
    it('collapses id-looking segments on routes with no explicit rule', () => {
      // A hypothetical future route not yet enumerated above.
      expect(toRoutePattern('/course/8f1e2d3c-0000-4a1b-9c2d-abcdef012345')).toBe(
        '/course/:id',
      )
      expect(toRoutePattern('/course/12345')).toBe('/course/:id')
      expect(toRoutePattern('/round/8f1e2d3c-0000-4a1b-9c2d-abcdef012345/edit/17')).toBe(
        '/round/:roundId', // matched by the explicit /round rule first
      )
      expect(toRoutePattern('/widget/deadbeefcafe0001')).toBe('/widget/:id')
    })

    it('leaves word-like literal segments untouched', () => {
      expect(toRoutePattern('/course/search')).toBe('/course/search')
      expect(toRoutePattern('/some/deep/settings/page')).toBe('/some/deep/settings/page')
    })

    it('never forwards a bare uuid/numeric id verbatim on an unknown route', () => {
      const uuid = '8f1e2d3c-0000-4a1b-9c2d-abcdef012345'
      expect(toRoutePattern(`/course/${uuid}`)).not.toContain(uuid)
      expect(toRoutePattern('/thing/99887766')).not.toContain('99887766')
    })
  })
})

describe('toRouteTitle', () => {
  it('maps known route patterns to human-readable titles', () => {
    expect(toRouteTitle('/')).toBe('Home')
    expect(toRouteTitle('/rounds')).toBe('Rounds')
    expect(toRouteTitle('/stats')).toBe('Stats')
    expect(toRouteTitle('/new/manual')).toBe('Manual course')
  })

  it('titles the id-bearing flows by pattern, not by concrete id', () => {
    expect(toRouteTitle('/round/8f1e2d3c-uuid')).toBe('Round entry')
    expect(toRouteTitle('/round/8f1e2d3c-uuid/summary')).toBe('Round summary')
    expect(toRouteTitle('/new/12345')).toBe('Course setup')
  })

  it('falls back to the collapsed pattern for routes without an explicit label', () => {
    expect(toRouteTitle('/course/12345')).toBe('/course/:id')
  })
})
