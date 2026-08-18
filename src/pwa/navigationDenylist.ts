/**
 * Paths that the service worker's navigation fallback must NOT answer with the
 * precached SPA shell.
 *
 * `vite-plugin-pwa` defaults `workbox.navigateFallback` to `index.html`, which
 * installs a workbox `NavigationRoute` matching **every** same-origin
 * navigation. Once the service worker is controlling the page, that route wins
 * before the request ever reaches Azure — so `staticwebapp.config.json`
 * excluding a path from `navigationFallback` is not enough on its own. Both
 * layers have to agree, or the SW quietly re-introduces the fallback that the
 * SWA config was written to prevent.
 *
 * That shipped once: `/r/{shareId}` is server-rendered by
 * `api/src/functions/share-page.js`, and the SWA config excludes it correctly —
 * but the SW had no denylist, so anyone who had already opened the app got
 * `index.html` for a share link and the SPA router's 404 screen. Social
 * crawlers (no service worker) saw the real card, which is what made it look
 * like the feature worked.
 *
 * Workbox tests these against `url.pathname + url.search`.
 */
export const NAVIGATION_FALLBACK_DENYLIST: RegExp[] = [
  // The public share landing page. The trailing slash is load-bearing: `/^\/r/`
  // would also swallow `/rounds`, which IS an SPA route.
  /^\/r\//,
  // Every function route. A navigation to one (opening a card image in a tab,
  // the `/api/r/{shareId}` direct fallback) must reach the backend, not the
  // shell — the same exclusion `staticwebapp.config.json` already makes.
  /^\/api\//,
]
