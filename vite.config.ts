import { defineConfig } from 'vite'
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
            // Match BOTH transports: direct mode hits api.golfcourseapi.com,
            // while production (proxy mode) hits the app's own same-origin
            // /api/* Functions. Without the /api/* clause, prod never cached
            // course responses and "previously-viewed courses work offline"
            // silently didn't hold.
            urlPattern: ({ url }) =>
              url.hostname === 'api.golfcourseapi.com' || url.pathname.startsWith('/api/'),
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
