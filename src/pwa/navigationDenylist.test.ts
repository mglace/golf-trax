import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { NAVIGATION_FALLBACK_DENYLIST } from './navigationDenylist'

/** How workbox's NavigationRoute applies the denylist. */
function servedByShell(path: string): boolean {
  return !NAVIGATION_FALLBACK_DENYLIST.some((re) => re.test(path))
}

describe('navigation fallback denylist', () => {
  it('keeps the SPA shell off the server-rendered share landing page', () => {
    expect(servedByShell('/r/MDUBlwoS_Cb9UOT6E05kkw')).toBe(false)
    expect(servedByShell('/r/abc?utm_source=share')).toBe(false)
  })

  it('keeps the SPA shell off the function routes', () => {
    expect(servedByShell('/api/r/abc')).toBe(false)
    expect(servedByShell('/api/share/abc/image.png')).toBe(false)
  })

  it('still serves the shell for every SPA route', () => {
    // `/rounds` is the trap: a `/^\/r/` denylist would break the Rounds tab.
    for (const path of [
      '/',
      '/rounds',
      '/round/abc',
      '/round/abc/summary',
      '/new',
      '/new/manual',
      '/new/123',
      '/stats',
      '/settings',
    ]) {
      expect(servedByShell(path), path).toBe(true)
    }
  })
})

/**
 * The other half of the invariant. `staticwebapp.config.json` rewriting a path
 * to a function is only effective while the service worker also stays out of the
 * way — once it's controlling the page, its navigation fallback answers first
 * and the rewrite never runs. Anything Azure hands to a function must therefore
 * be denylisted here too, and the two files sit in different workspaces with
 * nothing else connecting them (see api/test/routing.test.js for the seam
 * between that config and the functions themselves).
 */
describe('service worker vs. staticwebapp.config.json', () => {
  it('denylists every path the SWA config rewrites to a function', () => {
    const config = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../public/staticwebapp.config.json'), 'utf-8'),
    ) as { routes?: { route: string; rewrite?: string }[] }

    const rewritten = (config.routes ?? []).filter((r) => r.rewrite?.startsWith('/api/'))
    expect(rewritten.length).toBeGreaterThan(0)

    for (const { route } of rewritten) {
      // `/r/*` → a concrete path the wildcard would match.
      const sample = route.replace(/\*$/, 'sample')
      expect(
        NAVIGATION_FALLBACK_DENYLIST.some((re) => re.test(sample)),
        `${route} is rewritten to a function but the service worker would serve the SPA shell for ${sample}`,
      ).toBe(true)
    }
  })
})
