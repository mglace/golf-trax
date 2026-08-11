/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_GOLF_API_KEY: string
  readonly VITE_GOLF_API_BASE_URL: string
  // Phase 2 optional sync (Auth0 passwordless). Unset → sync disabled.
  readonly VITE_AUTH0_DOMAIN: string
  readonly VITE_AUTH0_CLIENT_ID: string
  readonly VITE_AUTH0_AUDIENCE: string
  // Google Analytics (GA4) measurement id. Unset → analytics disabled. Only
  // active in production builds (src/analytics/config.ts).
  readonly VITE_GA_MEASUREMENT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
