# Testing

GolfTrax has two test layers:

| Layer | Tool | Location | Run |
| ----- | ---- | -------- | --- |
| Unit / integration | [Vitest](https://vitest.dev) | `src/**/*.test.ts` | `npm test` |
| End-to-end (UI) | [Playwright](https://playwright.dev) | `e2e/**/*.spec.ts` | `npm run test:e2e` |

## End-to-end (Playwright)

The e2e suite drives the real Vite build in a headless Chromium at a
phone-sized viewport (GolfTrax is a mobile-first PWA). Playwright starts the dev
server itself — see `webServer` in `playwright.config.ts` — so you don't need one
running.

```bash
npm run test:e2e          # run the whole suite (headless)
npm run test:e2e:ui       # interactive UI mode (pick/step through tests)
npm run test:e2e:report   # open the HTML report from the last run
npx playwright test e2e/search.spec.ts   # a single file
```

### Hermetic by design

The tests never call the live GolfCourseAPI. The dev server runs in **proxy
mode** (no `VITE_GOLF_API_KEY`), so the client requests its own `/api/search`
and `/api/courses/:id` routes, which each test stubs at the network boundary via
`page.route`. Shared stubs and fixture courses live in `e2e/fixtures/courses.ts`:

- `stubSearch(page, { courses, status, delayMs })` — stub the search endpoint.
  Returns the live list of `search_query` values the app requested, so a test
  can assert on debouncing and query encoding.
- `stubCourseDetail(page, course)` — stub the single-course detail endpoint used
  when a result is tapped.

Because responses are stubbed, the suite is deterministic and safe to run
offline and in CI.

### Browsers in managed containers

Set `PW_CHROMIUM_PATH` (or `CHROME_PATH`) to launch a specific Chromium binary.
Failing that, some managed dev/CI containers pre-install Chromium at
`/opt/pw-browsers/chromium` and forbid re-downloading browsers; the config uses
that path only when it resolves to a real file, and otherwise falls back to
Playwright's own managed browser — so locally (or in CI after
`npx playwright install`) the standard flow just works.

> The `e2e/` sources and `playwright.config.ts` are their own TypeScript project
> (`tsconfig.e2e.json`, referenced from `tsconfig.json`), so `npm run typecheck`
> covers them — Playwright's esbuild transpile strips types without checking
> them, which would otherwise let the fixtures drift from `src/api/types.ts`.

## What's covered today

`e2e/search.spec.ts` exercises the course-search flow end to end: the idle
prompt, the two-character minimum before a request fires, debouncing, the
loading indicator, result rendering, the empty state, API errors + retry,
clearing the query, selecting a result (routing to setup), and the offline
warning.
