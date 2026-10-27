import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // The photographs are deliberately *not* precached — 4.4 MB on an
        // iPad 7th gen would make the first install crawl, and a tile whose
        // image fails simply draws its plate instead. They are cached the
        // first time they are shown, so the dashboard keeps its photography
        // when the wifi drops.
        runtimeCaching: [
          {
            urlPattern: /\/routine\/[^/]+\.webp$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'routine-photos',
              expiration: { maxEntries: 140, maxAgeSeconds: 60 * 60 * 24 * 120 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      includeAssets: ['favicon.svg', 'favicon-64.png', 'icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'My Planning',
        short_name: 'My Planning',
        description: 'Daily routine and portfolio dashboard',
        // Opens as a standalone app from the iPad Home Screen.
        display: 'standalone',
        // The dashboard reads in both orientations, so neither is locked.
        orientation: 'any',
        start_url: '/',
        scope: '/',
        background_color: '#F5F6F8',
        theme_color: '#F5F6F8',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          // Android adaptive icons crop to a circle; the artwork has enough
          // padding inside its rounded square to survive the mask.
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: true
  }
})
