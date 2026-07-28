# Performance & Load Checklist

Validation notes for the MVP success metrics:

- **App loads in < 2 s on mobile** (offline included)
- **Low data usage** (important for on-course use on cellular)
- **Works fully offline** (no network required at any point)

This doc has two parts: (1) a static bundle analysis done from the production
build, and (2) a checklist to run on a real device, since Lighthouse / device
metrics can't be captured from CI.

---

## 1. Bundle analysis (production build)

From `npm run build` (Vite + `vite-plugin-pwa`):

| Asset | Raw | Gzip | When it loads |
| --- | --- | --- | --- |
| `index-*.js` (entry) | 372 KB | **120 KB** | Every route, incl. the on-course entry flow |
| `StatsPage-*.js` | 394 KB | **109 KB** | Lazy — only when `/stats` is opened |
| `index-*.css` | 22 KB | **4.9 KB** | Every route |
| 3 × SVG icons | < 0.5 KB each | — | Install / favicon |
| **SW precache total** | **~772 KB** | ~233 KB | Fetched once at service-worker install |

### What's in each chunk

- **Entry chunk (120 KB gzip)** — React + ReactDOM (~45 KB), React Router
  (~11 KB), Dexie + dexie-react-hooks (~22 KB), Zustand (~1 KB), and all
  non-Stats app code. This is the critical-path payload for the on-course flow.
- **Stats chunk (109 KB gzip)** — dominated by **Recharts**. Correctly
  code-split: `recharts` is imported only in `src/features/stats/TrendChart.tsx`,
  which is reached only through the lazy-loaded `StatsPage` (`src/router.tsx`).
  It never touches the entry chunk.

### Findings

✅ **Recharts is off the critical path.** The heaviest dependency (109 KB gzip)
does not load until the user opens Stats. Good.

✅ **No web fonts; tiny CSS; SVG icons.** Typography uses `system-ui`, Tailwind
is purged to ~4.9 KB gzip, and icons are inline SVG. Excellent for low data.

⚠️ **The precache includes the Stats/Recharts chunk.** `globPatterns:
['**/*.{js,css,...}']` precaches *all* JS at SW install, so ~109 KB gzip of
Recharts is fetched even for a user who never opens Stats. This is a deliberate
trade-off: it's what makes Stats work **fully offline immediately**, satisfying
the "works fully offline" metric. Leave it unless the data budget is tight — if
so, exclude the Stats chunk from precache (via `globIgnores`) and let it
runtime-cache on first Stats visit instead.

💡 **Biggest optional lever: replace Recharts** (109 KB gzip) for what is a
single line chart. It's off the critical path, so this is low priority, but a
hand-rolled SVG line chart (the app already hand-rolls its icons) would remove
~100 KB from both the install payload and the first Stats visit. Medium effort;
revisit if the Stats screen ever feels heavy on cellular.

### Bonus finding (accessibility, not perf)

⚠️ `index.html` sets `maximum-scale=1.0, user-scalable=no` on the viewport,
which disables pinch-zoom. That's a **WCAG 1.4.4 (Resize Text) / 1.4.10**
failure. One-line fix — drop `maximum-scale` and `user-scalable=no`. (Flagged
here because it surfaced during the build inspection; it belongs with the a11y
pass.)

---

## 2. Real-device checklist (run in Chrome DevTools + Lighthouse)

None of these can be measured from CI — run them against a preview build
(`npm run build && npm run preview`) or the deployed SWA, ideally on a mid-tier
Android phone or with mobile emulation + throttling.

### Load performance (the "< 2 s" metric)

- [ ] **Lighthouse → Performance (Mobile, Slow 4G throttle), cold load** (first
      visit, no service worker yet). Target: FCP < 1.8 s, LCP < 2.5 s.
- [ ] **Warm load** (SW installed): reload and confirm the app shell renders
      near-instantly from cache. This is the load path that must beat 2 s.
- [ ] **Network tab, cold load:** confirm only the entry chunk (~120 KB gzip)
      + CSS load initially, and that `StatsPage-*.js` is **not** requested until
      you navigate to Stats.
- [ ] **Coverage tab:** check for large unused JS/CSS on first paint.

### Offline (the "works fully offline" metric)

- [ ] **Application → Service Workers:** SW is `activated and running`;
      **Cache Storage** shows the precache populated + a `golfcourseapi` runtime
      cache after a search.
- [ ] **Network → Offline, then reload:** the app shell loads; Home, Rounds,
      Stats all render.
- [ ] **Offline, start a round at a recently-played course:** works end to end
      (cache-first course load + local snapshot).
- [ ] **Offline, search for a new course:** the offline notice appears and the
      search fails gracefully with a retry — no crash, no infinite spinner.
- [ ] **Flaky-network test:** throttle to a very slow profile mid-search and
      confirm the `NetworkFirst` strategy falls back to cache within ~5 s
      (`networkTimeoutSeconds`) rather than hanging.

### PWA install

- [ ] **Lighthouse → PWA:** installable, has a valid manifest + icons, themed.
- [ ] **Add to Home Screen**, launch from the icon, and confirm it opens
      standalone and works offline from a cold app start.

### Data usage (on-course / cellular)

- [ ] After the first load, confirm repeat navigations make **no** network
      requests except course search/lookup (everything else is IndexedDB + SW).
- [ ] Confirm no unexpected large payloads (analytics, fonts, images) in the
      Network tab.
