import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// Managed CI/dev containers ship a pre-installed Chromium at a stable path and
// forbid re-downloading browsers. When that binary is present, launch it
// directly; otherwise fall back to Playwright's own managed browser (e.g. local
// dev or GitHub Actions after `npx playwright install`).
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium'
const executablePath = existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined

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
      use: { ...devices['Pixel 7'], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Force proxy mode: the client talks to /api/search, which the tests stub.
    env: { VITE_GOLF_API_KEY: '' },
  },
})
