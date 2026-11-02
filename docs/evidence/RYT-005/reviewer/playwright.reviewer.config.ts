import { defineConfig, devices } from '@playwright/test'

// Reviewer-only config for the RYT-005 ui-ux review. Reuses the identity preview build.
export default defineConfig({
  testDir: '.',
  testMatch: /reviewer(-rereview)?.spec.ts/,
  outputDir: './run-reviewer',
  reporter: [['list']],
  webServer: {
    command:
      'npm run build -- --base=/rytta-dnd-app/ --outDir=dist-identity && npm run preview -- --host 127.0.0.1 --port 4174 --strictPort --base=/rytta-dnd-app/ --outDir=dist-identity',
    cwd: '../../../..',
    url: 'http://127.0.0.1:4174/rytta-dnd-app/',
    reuseExistingServer: true,
    env: {
      VITE_DATA_MODE: 'supabase',
      VITE_SUPABASE_URL: 'https://rytta-test.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_browser_test_fixture',
    },
  },
  projects: [
    { name: 'phone', viewport: { width: 390, height: 844 } },
    { name: 'tablet', viewport: { width: 820, height: 1180 } },
  ].map(({ name, viewport }) => ({
    name,
    use: {
      ...devices['Desktop Chrome'],
      viewport,
      hasTouch: true,
      baseURL: 'http://127.0.0.1:4174/rytta-dnd-app/',
    },
  })),
})
