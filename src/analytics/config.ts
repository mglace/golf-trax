/**
 * Google Analytics (GA4) configuration — build-time gated, exactly like the
 * optional Auth0 sync surface (`src/auth/authConfig.ts`) and the direct/proxy
 * course-API transport.
 *
 * Analytics is active only when a measurement id is present *and* this is a
 * production build. With the id unset the entire analytics surface is inert —
 * `gtag.js` is never loaded and no requests leave the device — so the local,
 * offline-first experience is unchanged. Gating on `import.meta.env.PROD` keeps
 * `npm run dev`, Vitest, and Playwright from ever polluting real metrics; the
 * measurement id is a public value, safe to inline in the bundle.
 */

export interface AnalyticsConfig {
  measurementId: string
}

/**
 * Read the analytics config from the environment. Exported (not just the
 * module-level {@link analyticsConfig}, which is evaluated once at import) so
 * tests can exercise the gating directly with `vi.stubEnv`.
 */
export function readAnalyticsConfig(): AnalyticsConfig | null {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID
  if (!measurementId) return null
  // Never track from dev servers or test runs — only real production builds.
  if (!import.meta.env.PROD) return null
  return { measurementId }
}

/** Non-null iff analytics is configured for this build. */
export const analyticsConfig: AnalyticsConfig | null = readAnalyticsConfig()

/** Whether Google Analytics is active in this build. */
export const isAnalyticsConfigured = analyticsConfig !== null
