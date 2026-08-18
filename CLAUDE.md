# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GolfTrax is an **offline-first golf score-tracking PWA**. IndexedDB (via Dexie) is
the source of truth the UI always reads from; the app works fully offline from a
cold first launch with no account. Optional "Phase 2" cloud sync (Auth0
passwordless + Azure Functions + Cosmos DB) is a background reconciliation layer
layered on top — never a prerequisite for using the app.

There are **two independent workspaces**:

- **Root** — the SPA. React 18 + TypeScript + Vite + Tailwind. ES modules.
- **`api/`** — the backend: managed Azure Functions. Plain JavaScript, CommonJS,
  no build step, its own `package.json`/`node_modules`.

## Commands

SPA (run from repo root):

```bash
npm run dev            # Vite dev server on :5173
npm run build          # tsc -b && vite build  → dist/
npm run lint           # eslint, zero-warnings gate (--max-warnings 0)
npm run typecheck      # tsc -b --noEmit
npm run test           # vitest run (one-shot)
npm run test:watch     # vitest watch
npx vitest run src/domain/sync.test.ts   # a single test file
npm run test:e2e       # playwright test (e2e/, Chromium)
npm run test:e2e:ui    # playwright --ui
npm run test:e2e:report  # open the last HTML report
```

API (Azure Functions — separate workspace):

```bash
npm --prefix api install
npm --prefix api test      # node --test (Node's built-in runner, NOT vitest)
npm --prefix api start     # func start (needs Azure Functions Core Tools)
```

To exercise **proxy mode** locally (SPA + functions behind one origin, the way
production runs), use the SWA emulator instead of `npm run dev` alone:

```bash
npm run swa:start          # swa start — fronts the Vite dev server + api/
```

Vitest is deliberately scoped to `src/**/*.{test,spec}.{ts,tsx}` (see
`vite.config.ts`) so it never tries to run the api workspace's Node-native tests.
There is no combined test command — the three suites (Vitest, `api/`'s
`node --test`, Playwright) are separate invocations. Run both unit suites when
touching shared logic; `ci.yml` is what runs all three together.

**Two GitHub Actions workflows**, both on push/PR to `main`:

- `ci.yml` — the quality gate. `unit` job runs lint → typecheck → Vitest →
  `npm test --prefix api`; `e2e` job runs Playwright (Chromium only) and uploads
  the HTML report as an artifact. Runs on the same ref are cancel-in-progress.
- `azure-static-web-apps.yml` — builds and deploys to Azure SWA. It does **not**
  depend on `ci.yml`, so a red CI run does not block a deploy. Run the checks
  locally before pushing to `main`.

Path alias: `@/` → `src/` (configured in both `vite.config.ts` and `tsconfig`).

## Architecture

### Layering (SPA)

Code is organized by responsibility, and the dependency direction matters:

- **`src/domain/`** — pure business logic (scoring, stats, GIR derivation, and the
  sync reconciliation rules). **No Dexie, no network, no React.** This is the
  unit-tested correctness core; keep it that way so its rules can be tested in
  isolation.
- **`src/db/`** — Dexie schema (`db.ts`) and repositories (`roundsRepo`,
  `coursesRepo`). The only place that talks to IndexedDB.
- **`src/store/activeRound.ts`** — Zustand store holding the round currently being
  entered in memory for snappy input, auto-saving every mutation to IndexedDB so a
  refreshed/closed app resumes the draft losslessly.
- **`src/api/`** — the GolfCourseAPI client (course search/lookup).
- **`src/sync/`** — the client sync engine (Dexie + fetch glue that composes the
  pure decisions from `domain/sync.ts`).
- **`src/features/`** — one folder per screen/flow (home, course-search,
  round-entry, round-summary, history, stats, settings).

`src/main.tsx` is a thin entry (SW registration + deferred analytics); it renders
`src/AppRoot.tsx`, which mounts the router immediately and — in a sync-enabled
build — loads the Auth0 SDK lazily in a **sibling** subtree (`auth/Auth0Root.tsx`)
that reports its `AuthValue` up into an always-mounted `AuthContext.Provider`.
This keeps the heavy, first-paint-irrelevant SDK off the critical render path
without remounting the router. See the PWA/perf notes and `docs/PERF.md`.

### Data model

`Round` (`src/db/types.ts`) is the central entity. A round **snapshots** the
hole details (par/handicap/yardage from the selected tee) at creation time, so it
stays intact even if the cached course later changes. `HoleEntry.gir` is always
**derived** from par/score/putts — never set directly (see `deriveGir`). Totals
are recomputed on every write.

### Dual transport for course data

`src/api/golfCourseApi.ts` picks its transport at **build time**:

- **Direct mode** — `VITE_GOLF_API_KEY` present → browser calls GolfCourseAPI
  directly. For local dev only.
- **Proxy mode** — no client key → calls the app's own `/api/*` Azure Functions,
  which hold `GOLF_API_KEY` server-side.

**Never set `VITE_GOLF_API_KEY` in a production build** — it would inline the key
into the public bundle. Production always runs in proxy mode.

### Analytics (optional, build-time gated)

`src/analytics/` adds Google Analytics (GA4) following the same gating pattern as
sync: it's active only when `VITE_GA_MEASUREMENT_ID` is set **and** it's a
production build (`config.ts`). Unset → the whole surface is inert, `gtag.js`
never loads, and nothing leaves the device, so `npm run dev`, Vitest, and
Playwright never touch real metrics. In CI the id is set **only on push-to-main**,
not on PR preview builds (`azure-static-web-apps.yml`), so preview traffic never
lands in the production property. `initAnalytics()` and `startPageTracking()` are
wired once in `main.tsx` and run **synchronously**: `initAnalytics()` installs the
`gtag`/`dataLayer` command queue (an in-memory shim — no network or parse cost),
so page views and custom events are captured from the first interaction. Only
**`loadGtagScript()` (the `gtag.js` script — the largest resource and the longest
main-thread task) is deferred to the first idle window** so it doesn't compete
with first paint / LCP; gtag.js replays the queued commands in order once it
loads. Page views fire on route changes and are collapsed to
**route patterns** (`toRoutePattern` → `/round/:roundId`) so opaque round/course
ids never reach Google. Any path without an explicit rule still has id-looking
segments (uuid / numeric / hex / digit-bearing token) collapsed to `:id` as a
best-effort net — but add a named rule in `toRoutePattern` for new id-bearing
routes rather than relying on it. Each hit also carries a per-route
`page_title` from `toRouteTitle` (e.g. `Round entry`), **not** the static
`document.title`, so GA4's default "Pages and screens" report (which groups by
title) stays readable instead of folding every route into one "GolfTrax" row.
The sanitized pattern is installed as the default `page_location` via
`gtag('set', …)`, so GA's own hits (`session_start`, `user_engagement`) inherit
it too — not just the manual `page_view`. `trackEvent()` sends custom GA4
events; two are wired today, both from the feature layer (never `db/`/`domain/`,
which stay side-effect-free) and both carrying **only non-identifying
dimensions** — no opaque round/course ids, matching the route-pattern rule
above: `round_started` (params `round_length`, `hole_count`) when a draft round
is created in Course Setup, and `round_completed` (params `round_length`,
`hole_count`, `holes_entered`, `is_complete`, `total_score`, `vs_par`) when a
round is finalized in Round Summary. Because saving a partially-scored round is
supported, `total_score`/`vs_par` on `round_completed` reflect only the holes
entered, so `holes_entered`/`is_complete` ride along to keep partial rounds
separable (see the custom-definitions note below for what surfaces them in
reports). The measurement id is a public value, safe to inline.

To verify a live build, append **`?ga_debug=1`** to the URL: it sets GA4
`debug_mode` so this client's hits show in GA4 DebugView (Admin → DebugView). It
only flips `debug_mode` — it does **not** bypass the config gate, so dev/test
builds with no id stay inert, and normal visitors (no param) are unaffected.

Two property-side requirements the code can't enforce:

- GA4 Enhanced Measurement's "Page changes based on browser history events" must
  be **disabled** on the stream, since we track SPA navigations manually —
  otherwise GA fires its own `page_view` on `pushState` using the raw URL,
  re-introducing the id and double-counting.
- The custom event params above (`round_length`, `hole_count`, `holes_entered`,
  `is_complete`, `total_score`, `vs_par`, plus `share_target` and
  `highlight_kind` from `round_shared`) only show up in standard reports and
  explorations once each is registered under **Admin → Custom definitions** —
  text params (`round_length`, `is_complete`, `share_target`, `highlight_kind`)
  as custom dimensions, numeric ones (`hole_count`, `holes_entered`,
  `total_score`, `vs_par`) as custom metrics. Until then they're visible only in
  DebugView/Realtime and the BigQuery export, and registration is **not**
  retroactive — data collected before a definition exists is not backfilled.
  Register a param BEFORE the feature that emits it ships, or its first weeks of
  data are unrecoverable.

### Sync engine (Phase 2) — client/server lockstep

This is the subtle part. The reconciliation rules (last-write-wins by
server-stamped `version`, delete-wins, tombstones, cursor staleness) exist in
**two ports that must stay in lockstep**:

- `src/domain/sync.ts` (client, TypeScript)
- `api/src/sync-core.js` (server, JavaScript)

`src/domain/sync.test.ts` is the **shared specification** for both, and
`api/test/sync-core.test.js` mirrors it as a parity guard so the JS port can't
silently drift. If you change a rule in one port, change the other and update
**both** test files — they run in separate runners (Vitest vs `node --test`), so
neither one failing will surface from the other's command.

Sync invariants worth knowing before touching this area (full spec in
`docs/PHASE2.md`, especially §11):

- **Only completed rounds sync**; drafts stay device-local.
- `Round.dirty` is stored as `0 | 1`, not a boolean, because **Dexie cannot index
  booleans** (the push query is `where('dirty').equals(1)`).
- `owner` is `'local'` for pre-sign-in rounds; on first push after sign-in they're
  adopted into the account. **Logout clears account-owned rounds but keeps
  `owner === 'local'`** — this is what makes sign-out safe on a shared device.
- The user id **always** comes from the verified JWT `sub`, never from the request
  body. The server stamps every server-owned field (`version`,
  `serverUpdatedAt`, `serverTs`).
- **Auth header quirk:** Azure SWA reserves/overwrites the `Authorization` header
  on managed-function requests, so the client sends the bearer in
  `X-GolfTrax-Authorization` (the backend reads that first, falling back to
  `Authorization` for local proxy-mode dev). Preserve this on both sides.
- The backend is intentionally **auth-issuer-agnostic** (`api/src/auth.js` verifies
  a JWT against the issuer's JWKS) so the Auth0 choice stays swappable.

Sync is only active when all three `VITE_AUTH0_*` values are present at build time
(`src/auth/authConfig.ts`); otherwise the entire account/sync surface is inert and
the app behaves as the local-only MVP.

### PWA / service worker

The service worker is **registered manually** in
`src/pwa/registerServiceWorker.ts` (not auto-injected — `injectRegister: null` in
`vite.config.ts`) so update checks can fire on foreground/interval, which matters
for pinned home-screen installs. Runtime caching (`NetworkFirst`) is scoped
**deliberately to the public course-lookup routes only** — the authenticated
`/api/sync/*` and `/api/profile` endpoints must **never** be cached, or a cached
GET could serve one account's data to another on a shared device. Keep that scope
narrow if you edit the workbox config. The SW is disabled in dev.

**The navigation fallback is a second routing layer, and it outranks Azure.**
`navigateFallback` defaults to `index.html`, which makes the SW answer *every*
same-origin navigation from its precache — before the request can reach SWA, so
excluding a path in `staticwebapp.config.json` alone does nothing once the SW is
controlling the page. Any server-rendered path must therefore be listed in
**both** places: `navigationFallback.exclude` there and
`NAVIGATION_FALLBACK_DENYLIST` in `src/pwa/navigationDenylist.ts` (wired into the
workbox config; `src/pwa/navigationDenylist.test.ts` guards the pairing). That
bit `/r/{shareId}`: the SWA config was right, the SW had no denylist, so anyone
who had already opened the app got the shell and a router 404 for a share link —
while crawlers, which run no service worker, saw the real card and made the
feature look healthy. Note what a denylist fix can and cannot reach: a client
still running the OLD worker gets that build's precached shell and entry chunk,
so it keeps 404ing until `autoUpdate` activates the new worker and reloads — no
SPA-side route can rescue it, because the route isn't in the shell being served.
`/r/:shareId` does have an SPA route (`SharedRoundPage`), but as insurance
against the denylist regressing, not as a migration path.

### Routing

`src/router.tsx`: bottom-nav tabs (Home / Rounds / Stats) and the course-search
flow render inside `AppLayout`; the focused round-entry and round-summary flows
are top-level full-screen routes (no bottom tabs) to maximize on-course space.
`/r/:shareId` is also top-level, but it is a **fallback** — the backend normally
renders that path (see the PWA note above), and the SPA reaches it only if the
shell gets served there anyway, which the denylist is what prevents.

**Code-splitting:** the round-start flow (course search / setup / manual) and the
peripheral routes (rounds history, settings, stats) are `React.lazy`-loaded via
the `lazyRoute(id, element)` helper, which wraps each in a **per-route-keyed**
`ErrorBoundary` (reload on a failed chunk) + `Suspense`. The key matters: React
Router renders route elements into the Outlet unkeyed, so without it a failed
chunk on one route would leave the error screen stuck on the next. `StatsPage` in
particular keeps Recharts off the core flow. The round-start flow supports offline
(cached-course search, network-free manual entry), but reaching it offline
requires a prior online session — which is also when the SW precaches its chunks —
so the first-session chunk-fetch risk is bounded. The **core on-course routes —
`HomePage`, `RoundEntryPage`, `RoundSummaryPage` — stay eager in the entry chunk
on purpose**: they must work offline from a cold first launch (before the SW
controls the page), so they can't hang on a chunk fetch. Don't lazy-load them.

## Reference docs

- `docs/PHASE2.md` — full sync/accounts design; §11 is the hardening decisions the
  code cites by number.
- `docs/PHASE2-SETUP.md` — Auth0 + Cosmos setup.
- `DEPLOY.md` — Azure Static Web Apps (Free tier) deployment.
- `docs/PERF.md` — bundle analysis and load-performance checklist.
- `golf-app-mvp-requirements-final.md` — original MVP requirements.
