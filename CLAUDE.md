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
```

API (Azure Functions — separate workspace):

```bash
npm --prefix api install
npm --prefix api test      # node --test (Node's built-in runner, NOT vitest)
npm --prefix api start     # func start (needs Azure Functions Core Tools)
```

Vitest is deliberately scoped to `src/**/*.{test,spec}.{ts,tsx}` (see
`vite.config.ts`) so it never tries to run the api workspace's Node-native tests.
There is no combined test command — run both when touching shared logic.

**CI does not gate on lint/test.** The only GitHub Actions workflow
(`.github/workflows/azure-static-web-apps.yml`) builds and deploys to Azure SWA;
it does not run the linter, typecheck, or tests. Run those locally before pushing.

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

### Sync engine (Phase 2) — client/server lockstep

This is the subtle part. The reconciliation rules (last-write-wins by
server-stamped `version`, delete-wins, tombstones, cursor staleness) exist in
**two ports that must stay in lockstep**:

- `src/domain/sync.ts` (client, TypeScript)
- `api/src/sync-core.js` (server, JavaScript)

`src/domain/sync.test.ts` is the **shared specification** for both. If you change
a rule in one port, change the other and update that test.

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

### Routing

`src/router.tsx`: bottom-nav tabs (Home / Rounds / Stats) and the course-search
flow render inside `AppLayout`; the focused round-entry and round-summary flows
are top-level full-screen routes (no bottom tabs) to maximize on-course space.
`StatsPage` is lazy-loaded because it pulls in Recharts — keep the core on-course
flow off that chunk.

## Reference docs

- `docs/PHASE2.md` — full sync/accounts design; §11 is the hardening decisions the
  code cites by number.
- `docs/PHASE2-SETUP.md` — Auth0 + Cosmos setup.
- `DEPLOY.md` — Azure Static Web Apps (Free tier) deployment.
- `docs/PERF.md` — bundle analysis and load-performance checklist.
- `golf-app-mvp-requirements-final.md` — original MVP requirements.
