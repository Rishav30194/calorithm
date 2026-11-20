import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

// Tests against local Supabase. Run through `npm run test:integration`, which passes the local
// URL and publishable key in from `supabase status`.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    // One shared database and seed user: files run one at a time.
    fileParallelism: false,
    restoreMocks: true,
  },
})
