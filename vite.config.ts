import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Vitest scopes to the SPA source; the api/ workspace has its own
  // Node-native tests (`node --test`), which vitest must not try to run.
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'icon-maskable.svg'],
      manifest: {
        name: 'GolfTrax',
        short_name: 'GolfTrax',
        description: 'Track your golf rounds, scores, and stats — works offline.',
        theme_color: '#166534',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          // Scalable SVG covers all sizes for install (Chrome/Android/desktop).
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell + assets are precached. Course API responses are cached at
        // runtime so previously-viewed courses work offline; new searches still
        // require connectivity (expected — see requirements).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        runtimeCaching: [
          {
            // Cache ONLY the public course-lookup routes. Match both transports:
            // direct mode hits api.golfcourseapi.com; production (proxy mode)
            // hits the app's own /api/courses and /api/search Functions.
            //
            // Scoped deliberately to course routes — NOT a blanket `/api/*` —
            // because the authenticated Phase 2 endpoints (`/api/sync/*`,
            // `/api/profile`) must never be cached: NetworkFirst keys entries by
            // URL and ignores the bearer token, so a cached GET could serve one
            // account's rounds/profile to another on a shared device (the
            // logout rule clears IndexedDB, not Cache Storage). Those endpoints
            // fall through to NetworkOnly.
            urlPattern: ({ url }) =>
              url.hostname === 'api.golfcourseapi.com' ||
              url.pathname.startsWith('/api/courses') ||
              url.pathname.startsWith('/api/search'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'golfcourseapi',
              // On a spotty on-course connection, fall back to a cached
              // response after 5s instead of hanging on a dying request.
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Keep the service worker off during dev to avoid stale-cache confusion.
        enabled: false,
      },
    }),
  ],
})
