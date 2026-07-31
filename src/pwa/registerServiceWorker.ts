import { registerSW } from 'virtual:pwa-register'

// How often to ask the browser to re-check for a new service worker while the
// app is open. Home-screen PWAs are typically *resumed* (not navigated) when
// reopened, so the browser's own update check rarely fires on its own.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000 // hourly

/**
 * Registers the service worker and keeps the installed app current.
 *
 * The build uses `registerType: 'autoUpdate'`, so once a newer service worker
 * is found it installs, activates, and reloads the page automatically. The
 * missing piece for a pinned home-screen app is *triggering the check*: the OS
 * resumes the frozen app instead of doing a fresh navigation, so nothing ever
 * asks the browser to look for a new version. We fill that gap by re-checking
 *   - whenever the app returns to the foreground (the case that matters on
 *     phones), and
 *   - on a slow background interval for long-lived sessions.
 */
export function registerServiceWorker(): void {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      const checkForUpdate = () => {
        // Skip while offline or mid-install to avoid pointless network churn.
        if (registration.installing) return
        if ('onLine' in navigator && !navigator.onLine) return
        void registration.update()
      }

      // Foreground return is the key trigger for home-screen PWAs.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })
      window.addEventListener('focus', checkForUpdate)

      window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS)
    },
  })
}
