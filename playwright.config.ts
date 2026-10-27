import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173/rytta-dnd-app/', trace: 'retain-on-failure' },
  webServer: {
    command:
      'npm run build -- --base=/rytta-dnd-app/ && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --base=/rytta-dnd-app/',
    url: 'http://127.0.0.1:4173/rytta-dnd-app/',
    reuseExistingServer: false,
    env: { VITE_DATA_MODE: 'demo' },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
})
