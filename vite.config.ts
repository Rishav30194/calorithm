/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const themeColor = '#0f766e'

export default defineConfig({
  // GitHub Pages serves the app from /calorithm/. Dev and preview use the same path, so a
  // path bug shows up locally instead of only after a deploy.
  base: '/calorithm/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The app asks before it reloads into a new build, so an entry in progress is never lost.
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Calorithm',
        short_name: 'Calorithm',
        description: 'Calorie and protein tracking with a weekly maintenance estimate.',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: themeColor,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    // scripts/check-bundle.mjs reads the manifest to measure the first load.
    manifest: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/data/**'],
      exclude: ['**/*.test.{ts,tsx}', 'src/data/database.types.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: {
        'src/domain/**': { lines: 90, branches: 90 },
      },
    },
  },
})
