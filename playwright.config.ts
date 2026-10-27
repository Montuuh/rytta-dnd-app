import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173/rytta-dnd-app/', trace: 'retain-on-failure' },
  webServer: [
    {
      command:
        'npm run build -- --base=/rytta-dnd-app/ && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --base=/rytta-dnd-app/',
      url: 'http://127.0.0.1:4173/rytta-dnd-app/',
      reuseExistingServer: false,
      env: { VITE_DATA_MODE: 'demo' },
    },
    {
      command:
        'npm run build -- --base=/rytta-dnd-app/ --outDir=dist-identity && npm run preview -- --host 127.0.0.1 --port 4174 --strictPort --base=/rytta-dnd-app/ --outDir=dist-identity',
      url: 'http://127.0.0.1:4174/rytta-dnd-app/',
      reuseExistingServer: false,
      env: {
        VITE_DATA_MODE: 'supabase',
        VITE_SUPABASE_URL: 'https://rytta-test.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_browser_test_fixture',
      },
    },
  ],
  projects: [
    {
      name: 'desktop',
      testIgnore: '**/identity.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'tablet',
      testIgnore: '**/identity.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true },
    },
    {
      name: 'mobile',
      testIgnore: '**/identity.spec.ts',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    ...[
      { name: 'identity-desktop', viewport: { width: 1440, height: 1000 } },
      { name: 'identity-tablet', viewport: { width: 820, height: 1180 } },
      { name: 'identity-mobile', viewport: { width: 390, height: 844 } },
    ].map(({ name, viewport }) => ({
      name,
      testMatch: '**/identity.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport,
        hasTouch: name !== 'identity-desktop',
        baseURL: 'http://127.0.0.1:4174/rytta-dnd-app/',
      },
    })),
  ],
})
