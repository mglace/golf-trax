/**
 * Decides whether to show the iOS "Add to Home Screen" prompt.
 *
 * iOS never offers to install a web app on its own (there is no
 * `beforeinstallprompt` on WebKit), so unless we tell people, almost nobody
 * finds Share → Add to Home Screen. Installing matters more for GolfTrax than
 * for most sites: IndexedDB is the source of truth for every round, and Safari
 * may evict script-writable storage for a site that goes unused for about a
 * week of browsing, while home-screen web apps are exempt. A golfer who plays
 * every other week in a Safari tab can lose their history.
 *
 * The rules are pure functions over a small {@link InstallEnv} so they can be
 * unit-tested without a browser; {@link browserInstallEnv} adapts the real one.
 */

/** The slice of the browser environment the decision depends on. */
export interface InstallEnv {
  userAgent: string
  /** `navigator.platform` — iPadOS reports `MacIntel` with a desktop UA. */
  platform: string
  maxTouchPoints: number
  /** Legacy iOS flag, true when launched from the home screen. */
  navigatorStandalone: boolean | undefined
  /** `matchMedia('(display-mode: standalone)').matches`. */
  displayModeStandalone: boolean
}

/** localStorage key recording that the user dismissed the prompt. */
export const INSTALL_PROMPT_DISMISSED_KEY = 'golftrax.installPrompt.dismissed'

/** iPhone / iPod / iPad, including iPadOS 13+ which masquerades as a Mac. */
export function isIos(env: InstallEnv): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true
  // iPadOS "desktop-class" Safari: Mac UA and platform, but a touch screen.
  // Real Macs report 0 touch points.
  return env.platform === 'MacIntel' && env.maxTouchPoints > 1
}

/**
 * In-app browsers (Facebook, Instagram, LinkedIn, Line, Gmail's and Google's
 * apps, …) are WKWebViews with no "Add to Home Screen" action, so instructions
 * would point at a button that isn't there.
 */
export function isInAppBrowser(env: InstallEnv): boolean {
  return /FBAN|FBAV|FBIOS|Instagram|LinkedInApp|Line\/|GSA\/|Twitter|Snapchat|Pinterest/i.test(
    env.userAgent,
  )
}

/** Already running from the home screen. */
export function isStandalone(env: InstallEnv): boolean {
  return env.navigatorStandalone === true || env.displayModeStandalone
}

/**
 * Show the prompt to iOS users in a real browser (Safari, or Chrome / Edge /
 * Firefox, which gained Add to Home Screen in iOS 16.4) who haven't installed
 * the app and haven't dismissed the prompt before.
 */
export function shouldShowInstallPrompt(env: InstallEnv, dismissed: boolean): boolean {
  return !dismissed && isIos(env) && !isInAppBrowser(env) && !isStandalone(env)
}

/** Reads the live browser environment. Safe to call during SSR-less render. */
export function browserInstallEnv(): InstallEnv {
  const nav = navigator as Navigator & { standalone?: boolean }
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    navigatorStandalone: nav.standalone,
    displayModeStandalone:
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches,
  }
}

/**
 * Storage access can throw (Safari private mode on older iOS, blocked site
 * data), so both helpers swallow errors. A failed read means "not dismissed";
 * a failed write just means the prompt may reappear next visit.
 */
export function readInstallPromptDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function writeInstallPromptDismissed(): void {
  try {
    localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, '1')
  } catch {
    /* storage unavailable — the in-memory dismissal still hides it */
  }
}
