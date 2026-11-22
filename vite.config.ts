/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { configDefaults } from 'vitest/config'

const themeColor = '#0f766e'

// The app compares this with app_config.min_app_version before every sync.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
if (typeof version !== 'string') throw new Error('package.json has no version')

// The label photo reader's English data (phase 13). tesseract.js 7.0.0 can only load it from
// PATH/eng.traineddata.gz, a fixed name Vite's hashed assets can't give, so this copies it from
// the package into the build at a path that carries the package's version.
const require = createRequire(import.meta.url)
const engData = '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'
const { version: engVersion } = require('@tesseract.js-data/eng/package.json')
const tessdataDir = `tessdata/eng-${engVersion}`

const tessdata = (): Plugin => {
  const file = `${tessdataDir}/eng.traineddata.gz`
  const source = () => readFileSync(require.resolve(engData))
  let base = '/'
  return {
    name: 'calorithm-tessdata',
    configResolved(config) {
      base = config.base
    },
    configureServer(server) {
      server.middlewares.use(`${base}${file}`, (_request, response) => {
        response.setHeader('Content-Type', 'application/gzip')
        response.end(source())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: file, source: source() })
    },
  }
}

export default defineConfig({
  // GitHub Pages serves the app from /calorithm/. Dev and preview use the same path, so a
  // path bug shows up locally instead of only after a deploy.
  base: '/calorithm/',
  plugins: [
    react(),
    tailwindcss(),
    tessdata(),
    VitePWA({
      // 'prompt' never reloads on its own, so an entry in progress is never lost: a new build
      // waits until the user selects Update on the Update available banner.
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
        // wasm: the barcode scanner's decoder, so a saved pack scans offline (phase 11).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,wasm}'],
        // The label photo reader (about 7 MB) downloads on first use, not at install, and is
        // cached then, so later photos read offline (phase 13, decision 0030).
        globIgnores: ['**/worker.min-*.js', '**/tesseract-core-*.js', 'tessdata/**'],
        runtimeCaching: [
          {
            urlPattern:
              /\/(assets\/(worker\.min|tesseract-core-[\w-]+\.wasm)-[\w-]+\.js|tessdata\/[\w.-]+\/eng\.traineddata\.gz)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'label-reader',
              // One worker, one core, and one language file per deployed version.
              expiration: { maxEntries: 6 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __TESSDATA_DIR__: JSON.stringify(tessdataDir),
  },
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
    // Integration tests need local Supabase; they run through vitest.integration.config.ts.
    exclude: [...configDefaults.exclude, 'src/**/*.integration.test.ts'],
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
