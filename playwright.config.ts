import { defineConfig, devices } from '@playwright/test'

const port = 4173
const isCi = process.env.CI !== undefined

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: isCi ? 1 : 0,
  reporter: isCi ? 'github' : 'list',
  use: {
    // The production build is served under the GitHub Pages path.
    baseURL: `http://localhost:${port}/calorithm/`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'phone',
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 740 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    // Serves the production build; `check:full` builds it first with the local Supabase keys.
    command: `npm run preview -- --port ${port} --strictPort`,
    url: `http://localhost:${port}/calorithm/`,
    reuseExistingServer: !isCi,
  },
})
