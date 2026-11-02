import { defineConfig, devices } from '@playwright/test'

// Reviewer-only config for the RYT-005 DM redesign review: isolated build and port (4184).
const out = 'C:/Users/dmont/AppData/Local/Temp/claude/C--Users-dmont-Desktop-CODE---Proyectos-rytta-dnd-app/ba0218f7-890c-4c1e-a6ea-5549d699d53c/scratchpad/dist-reviewer'
export default defineConfig({
  testDir: '.',
  testMatch: /reviewer-dm(-overflow|-rereview)?\.spec\.ts/,
  reporter: [['list']],
  webServer: {
    command: `npm run build -- --base=/rytta-dnd-app/ --outDir="${out}" --emptyOutDir && npm run preview -- --host 127.0.0.1 --port 4184 --strictPort --base=/rytta-dnd-app/ --outDir="${out}"`,
    cwd: '../../../..',
    url: 'http://127.0.0.1:4184/rytta-dnd-app/',
    reuseExistingServer: false,
    timeout: 240000,
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
      baseURL: 'http://127.0.0.1:4184/rytta-dnd-app/',
    },
  })),
})
