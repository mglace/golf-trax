import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// trackPageView is mocked so these tests assert the *tracker's* logic (when it
// fires and with what path) independently of gtag / the environment gating.
const trackPageView = vi.fn()
vi.mock('./gtag', () => ({ trackPageView: (p: string) => trackPageView(p) }))

import { startPageTracking } from './pageTracking'

type Listener = (state: {
  location: { pathname: string }
  navigation: { state: string }
}) => void

/** A minimal stand-in for the React Router data router. */
function fakeRouter(initialPath: string) {
  const listeners: Listener[] = []
  const router = {
    state: { location: { pathname: initialPath } },
    subscribe(fn: Listener) {
      listeners.push(fn)
      return () => {
        const i = listeners.indexOf(fn)
        if (i >= 0) listeners.splice(i, 1)
      }
    },
    navigate(pathname: string, navState = 'idle') {
      listeners.forEach((fn) =>
        fn({ location: { pathname }, navigation: { state: navState } }),
      )
    },
  }
  return router
}

beforeEach(() => trackPageView.mockClear())
afterEach(() => vi.restoreAllMocks())

describe('startPageTracking', () => {
  it('reports the initial page immediately', () => {
    startPageTracking(fakeRouter('/'))
    expect(trackPageView).toHaveBeenCalledTimes(1)
    expect(trackPageView).toHaveBeenCalledWith('/')
  })

  it('fires once per navigation to a new path', () => {
    const router = fakeRouter('/')
    startPageTracking(router)
    trackPageView.mockClear()

    router.navigate('/rounds')
    router.navigate('/stats')

    expect(trackPageView).toHaveBeenCalledTimes(2)
    expect(trackPageView).toHaveBeenNthCalledWith(1, '/rounds')
    expect(trackPageView).toHaveBeenNthCalledWith(2, '/stats')
  })

  it('ignores non-idle navigation transitions', () => {
    const router = fakeRouter('/')
    startPageTracking(router)
    trackPageView.mockClear()

    router.navigate('/rounds', 'loading')
    expect(trackPageView).not.toHaveBeenCalled()

    router.navigate('/rounds', 'idle')
    expect(trackPageView).toHaveBeenCalledTimes(1)
  })

  it('de-dupes settling on the same path', () => {
    const router = fakeRouter('/')
    startPageTracking(router)
    trackPageView.mockClear()

    router.navigate('/rounds')
    router.navigate('/rounds')

    expect(trackPageView).toHaveBeenCalledTimes(1)
  })

  it('stops reporting after the returned unsubscribe is called', () => {
    const router = fakeRouter('/')
    const unsubscribe = startPageTracking(router)
    trackPageView.mockClear()

    unsubscribe()
    router.navigate('/rounds')

    expect(trackPageView).not.toHaveBeenCalled()
  })
})
