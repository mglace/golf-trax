import { statSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

/**
 * Resolve which Chromium binary to launch:
 *
 * 1. An explicit `PW_CHROMIUM_PATH` / `CHROME_PATH` opt-in always wins.
 * 2. Else, managed CI/dev containers that pre-install Chromium at a stable path
 *    and forbid re-downloading browsers — but only when that path resolves to a
 *    real *file* (the symlink's target). A directory or missing path falls
 *    through rather than handing Playwright an unlaunchable executable.
 * 3. Else `undefined` → Playwright's own managed browser (local dev, or CI after
 *    `npx playwright install`).
 *
 * Keeping it explicit means the branch is intentional and a bad path fails
 * loudly at resolution rather than as an opaque launch error.
 */
function resolveChromiumPath(): string | undefined {
  const explicit = process.env.PW_CHROMIUM_PATH ?? process.env.CHROME_PATH
  if (explicit) return explicit
  const preinstalled = '/opt/pw-browsers/chromium'
  try {
    if (statSync(preinstalled).isFile()) return preinstalled
  } catch {
    /* not present — fall through to Playwright's managed browser */
  }
  return undefined
}

const executablePath = resolveChromiumPath()

/**
 * Playwright end-to-end config for GolfTrax.
 *
 * Tests live in `e2e/` and drive the real Vite build in a browser. The dev
 * server is started for us (proxy mode: no VITE_GOLF_API_KEY, so the client
 * calls its own `/api/*` routes — which the tests intercept and stub, keeping
 * runs hermetic and independent of the live GolfCourseAPI).
 *
 * The container ships Chromium at PLAYWRIGHT_BROWSERS_PATH, so `webkit`/
 * `firefox` are intentionally omitted — this is a mobile-first PWA and Chromium
 * on a phone-sized viewport is the representative target.
 */
const PORT = 5173
const BASE_URL = `http://localhost:${PORT}`

/**
 * A second dev server built *with* Auth0 configured, so the optional
 * account/sync surface actually renders. The whole surface is gated at build
 * time on `VITE_AUTH0_*` (`src/auth/authConfig.ts`), which means the default
 * server above can never exercise it — and equally, tests on that server prove
 * the local-only MVP is untouched.
 *
 * The values are deliberately fake: specs stub `auth.example.test` at the
 * network boundary, so no test ever reaches a real tenant.
 */
const SYNC_PORT = 5174
const SYNC_BASE_URL = `http://localhost:${SYNC_PORT}`
export const AUTH0_TEST_DOMAIN = 'auth.example.test'

export default defineConfig({
  testDir: './e2e',
  // Fail the CI build if a test.only is accidentally committed.
  forbidOnly: !!process.env.CI,
  // No inter-test shared state (each test stubs its own network), so run in
  // parallel locally; retry once on CI to absorb rare timing flakes.
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // Phone-sized surface — GolfTrax is a portrait, mobile-first PWA.
    ...devices['Pixel 7'],
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /\.sync\.spec\.ts$/,
      use: { ...devices['Pixel 7'], launchOptions: { executablePath } },
    },
    {
      // Specs named `*.sync.spec.ts` need the account surface, so they run
      // against the sync-enabled server instead.
      name: 'chromium-sync',
      testMatch: /\.sync\.spec\.ts$/,
      use: {
        ...devices['Pixel 7'],
        baseURL: SYNC_BASE_URL,
        launchOptions: { executablePath },
      },
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${PORT} --strictPort`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // Pin every build-time gate this project's guarantees rest on, so a
      // developer's `.env.local` can't change what is under test. Vite lets
      // `.env.local` win for any key absent from `process.env`, and
      // `.env.example` — which DEPLOY.md says to copy — ships all four of these
      // truthy. Blank: forces proxy mode (the client talks to /api/search, which
      // the tests stub) and keeps the account surface compiled out, which is the
      // whole point of the local-only specs.
      env: {
        VITE_GOLF_API_KEY: '',
        VITE_AUTH0_DOMAIN: '',
        VITE_AUTH0_CLIENT_ID: '',
        VITE_AUTH0_AUDIENCE: '',
      },
    },
    {
      command: `npm run dev -- --port ${SYNC_PORT} --strictPort`,
      url: SYNC_BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        VITE_GOLF_API_KEY: '',
        VITE_AUTH0_DOMAIN: AUTH0_TEST_DOMAIN,
        VITE_AUTH0_CLIENT_ID: 'e2e-client-id',
        VITE_AUTH0_AUDIENCE: 'https://api.example.test',
      },
    },
  ],
})
