import { describe, it, expect, vi, afterEach } from 'vitest'
import { wantsGaDebug } from './gtag'

describe('wantsGaDebug', () => {
  it('enables debug for ga_debug=1 and ga_debug=true', () => {
    expect(wantsGaDebug('?ga_debug=1')).toBe(true)
    expect(wantsGaDebug('?ga_debug=true')).toBe(true)
  })

  it('is off when the param is absent', () => {
    expect(wantsGaDebug('')).toBe(false)
    expect(wantsGaDebug('?foo=bar')).toBe(false)
  })

  it('is off for other/false-ish values, not just any presence', () => {
    expect(wantsGaDebug('?ga_debug=0')).toBe(false)
    expect(wantsGaDebug('?ga_debug=false')).toBe(false)
    expect(wantsGaDebug('?ga_debug=')).toBe(false)
  })

  it('finds the param alongside others', () => {
    expect(wantsGaDebug('?foo=bar&ga_debug=1')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// initAnalytics / trackPageView exercise the DOM. The project runs Vitest in
// the default `node` environment (no jsdom), so rather than pull in a DOM
// implementation we stub the tiny slice of window/document these functions
// touch. gtag reads window/document at call time, so stubbing before importing
// a fresh module copy (resetModules) is enough. The mocked ./config controls
// whether the surface is active.
// ---------------------------------------------------------------------------

function fakeDom(pathname = '/', search = '') {
  const appended: Array<Record<string, unknown>> = []
  const win: Record<string, unknown> = {
    location: { origin: 'https://app.test', pathname, search },
  }
  const doc = {
    title: 'GolfTrax',
    createElement: () => ({} as Record<string, unknown>),
    head: { appendChild: (el: Record<string, unknown>) => appended.push(el) },
  }
  return { win, doc, appended }
}

async function loadGtag(
  config: { measurementId: string } | null,
  pathname = '/',
  search = '',
) {
  vi.resetModules()
  vi.doMock('./config', () => ({
    analyticsConfig: config,
    isAnalyticsConfigured: config !== null,
  }))
  const dom = fakeDom(pathname, search)
  vi.stubGlobal('window', dom.win)
  vi.stubGlobal('document', dom.doc)
  const mod = await import('./gtag')
  return { mod, dom }
}

/** Flatten the pushed `arguments` objects into plain arrays for assertions. */
function calls(win: Record<string, unknown>): unknown[][] {
  const dataLayer = (win.dataLayer as unknown[]) ?? []
  return dataLayer.map((entry) => Array.from(entry as ArrayLike<unknown>))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.doUnmock('./config')
})

describe('initAnalytics (unconfigured)', () => {
  it('loads nothing and defines no globals when analytics is off', async () => {
    const { mod, dom } = await loadGtag(null)
    mod.initAnalytics()
    expect(dom.win.gtag).toBeUndefined()
    expect(dom.win.dataLayer).toBeUndefined()
    expect(dom.appended).toHaveLength(0)
  })

  it('trackPageView / trackEvent are inert no-ops when off', async () => {
    const { mod, dom } = await loadGtag(null)
    expect(() => mod.trackPageView('/round/8f1e-uuid')).not.toThrow()
    expect(() => mod.trackEvent('round_completed')).not.toThrow()
    expect(dom.win.dataLayer).toBeUndefined()
  })
})

describe('initAnalytics (configured)', () => {
  it('injects gtag.js for the measurement id and configures with send_page_view:false', async () => {
    const { mod, dom } = await loadGtag({ measurementId: 'G-TEST123' })
    mod.initAnalytics()

    expect(typeof dom.win.gtag).toBe('function')
    expect(dom.appended).toHaveLength(1)
    expect(dom.appended[0].src).toBe(
      'https://www.googletagmanager.com/gtag/js?id=G-TEST123',
    )

    const config = calls(dom.win).find((c) => c[0] === 'config')
    expect(config?.[1]).toBe('G-TEST123')
    expect(config?.[2]).toMatchObject({ send_page_view: false })
    expect(config?.[2]).not.toHaveProperty('debug_mode')
  })

  it('enables debug_mode only when ?ga_debug=1 is present', async () => {
    const { mod, dom } = await loadGtag({ measurementId: 'G-TEST123' }, '/', '?ga_debug=1')
    mod.initAnalytics()
    const config = calls(dom.win).find((c) => c[0] === 'config')
    expect(config?.[2]).toMatchObject({ debug_mode: true })
  })

  it('is idempotent — a second call injects no second script', async () => {
    const { mod, dom } = await loadGtag({ measurementId: 'G-TEST123' })
    mod.initAnalytics()
    mod.initAnalytics()
    expect(dom.appended).toHaveLength(1)
  })
})

describe('trackPageView sanitization (the privacy guarantee on the wire)', () => {
  it('sends the collapsed pattern as page_location, never the raw id', async () => {
    const uuid = '8f1e2d3c-0000-4a1b-9c2d-abcdef012345'
    const { mod, dom } = await loadGtag({ measurementId: 'G-TEST123' })
    mod.initAnalytics()

    mod.trackPageView(`/round/${uuid}/summary`)

    const set = calls(dom.win)
      .filter((c) => c[0] === 'set')
      .pop()
    expect(set?.[1]).toMatchObject({
      page_location: 'https://app.test/round/:roundId/summary',
      page_title: 'Round summary',
    })

    // A page_view event was emitted...
    expect(calls(dom.win).some((c) => c[0] === 'event' && c[1] === 'page_view')).toBe(true)
    // ...and the raw uuid never appears anywhere in the dataLayer.
    expect(JSON.stringify(calls(dom.win))).not.toContain(uuid)
  })
})
