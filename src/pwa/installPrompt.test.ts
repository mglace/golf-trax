import { describe, expect, it } from 'vitest'
import {
  isInAppBrowser,
  isIos,
  isStandalone,
  shouldShowInstallPrompt,
  type InstallEnv,
} from './installPrompt'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1'
const IPHONE_FACEBOOK =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.37.110;]'
const IPHONE_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 354.0.0.0.0'
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'

function env(overrides: Partial<InstallEnv> = {}): InstallEnv {
  return {
    userAgent: IPHONE_SAFARI,
    platform: 'iPhone',
    maxTouchPoints: 5,
    navigatorStandalone: false,
    displayModeStandalone: false,
    ...overrides,
  }
}

describe('isIos', () => {
  it('detects iPhone', () => {
    expect(isIos(env())).toBe(true)
  })

  it('detects iPadOS desktop-class Safari by touch points', () => {
    expect(isIos(env({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 5 }))).toBe(
      true,
    )
  })

  it('does not treat a real Mac as iOS', () => {
    expect(isIos(env({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 0 }))).toBe(
      false,
    )
  })

  it('does not treat Android as iOS', () => {
    expect(isIos(env({ userAgent: ANDROID_CHROME, platform: 'Linux armv8l' }))).toBe(false)
  })
})

describe('isInAppBrowser', () => {
  it('flags Facebook and Instagram webviews', () => {
    expect(isInAppBrowser(env({ userAgent: IPHONE_FACEBOOK }))).toBe(true)
    expect(isInAppBrowser(env({ userAgent: IPHONE_INSTAGRAM }))).toBe(true)
  })

  it('does not flag Safari or Chrome', () => {
    expect(isInAppBrowser(env())).toBe(false)
    expect(isInAppBrowser(env({ userAgent: IPHONE_CHROME }))).toBe(false)
  })
})

describe('isStandalone', () => {
  it('honors the legacy navigator.standalone flag', () => {
    expect(isStandalone(env({ navigatorStandalone: true }))).toBe(true)
  })

  it('honors the display-mode media query', () => {
    expect(isStandalone(env({ navigatorStandalone: undefined, displayModeStandalone: true }))).toBe(
      true,
    )
  })

  it('is false in a browser tab', () => {
    expect(isStandalone(env())).toBe(false)
  })
})

describe('shouldShowInstallPrompt', () => {
  it('shows in iPhone Safari when not installed or dismissed', () => {
    expect(shouldShowInstallPrompt(env(), false)).toBe(true)
  })

  it('shows in Chrome on iOS (Add to Home Screen since iOS 16.4)', () => {
    expect(shouldShowInstallPrompt(env({ userAgent: IPHONE_CHROME }), false)).toBe(true)
  })

  it('hides once dismissed', () => {
    expect(shouldShowInstallPrompt(env(), true)).toBe(false)
  })

  it('hides when already launched from the home screen', () => {
    expect(shouldShowInstallPrompt(env({ navigatorStandalone: true }), false)).toBe(false)
  })

  it('hides in in-app browsers that cannot install', () => {
    expect(shouldShowInstallPrompt(env({ userAgent: IPHONE_FACEBOOK }), false)).toBe(false)
  })

  it('hides on Android and desktop', () => {
    expect(
      shouldShowInstallPrompt(env({ userAgent: ANDROID_CHROME, platform: 'Linux armv8l' }), false),
    ).toBe(false)
    expect(
      shouldShowInstallPrompt(
        env({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 0 }),
        false,
      ),
    ).toBe(false)
  })
})
