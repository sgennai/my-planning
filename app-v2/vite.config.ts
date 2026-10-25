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
      includeAssets: ['favicon.svg', 'icon.svg', 'apple-touch-icon.png'],
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
