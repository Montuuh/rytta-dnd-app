import { existsSync } from 'node:fs'
import { defineConfig, devices, webkit } from '@playwright/test'

// RYT-117: scroll anchoring differs between engines, so the long-list scroll spec also runs in
// WebKit when it is installed here (`npx playwright install webkit`); without it the projects are
// left out and only Chromium runs the spec.
const hasWebkit = (() => {
  try {
    return existsSync(webkit.executablePath())
  } catch {
    return false
  }
})()

// The owner's .env.local sets the public contact; specs always see the unconfigured state. An
// explicit empty value in the process environment wins over every .env file.
const unconfigured = { VITE_CONTACT_EMAIL: '', VITE_OWNER_NAME: '', VITE_SITE_URL: '' }

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Tests are CPU-bound (axe, layout); local machines have spare cores, CI keeps the default.
  workers: process.env.CI ? undefined : '75%',
  // A cold page boot under a full parallel run can pass the 5s default; waiting longer never
  // weakens an assertion.
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173/rytta-dnd-app/', trace: 'retain-on-failure' },
  // Bundles only: type checking is part of npm run check, not of every e2e start.
  webServer: [
    {
      command:
        'npx vite build --base=/rytta-dnd-app/ && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --base=/rytta-dnd-app/',
      url: 'http://127.0.0.1:4173/rytta-dnd-app/',
      reuseExistingServer: false,
      env: { VITE_DATA_MODE: 'demo', ...unconfigured },
    },
    {
      command:
        'npx vite build --base=/rytta-dnd-app/ --outDir=dist-identity && npm run preview -- --host 127.0.0.1 --port 4174 --strictPort --base=/rytta-dnd-app/ --outDir=dist-identity',
      url: 'http://127.0.0.1:4174/rytta-dnd-app/',
      reuseExistingServer: false,
      env: {
        VITE_DATA_MODE: 'supabase',
        VITE_SUPABASE_URL: 'https://rytta-test.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_browser_test_fixture',
        ...unconfigured,
      },
    },
    {
      // RYT-116: the root-path build Cloudflare serves, with the headers from its `_headers` file.
      command:
        'npx vite build --base=/ --outDir=dist-headers && node scripts/serve-with-headers.mjs dist-headers 4175',
      url: 'http://127.0.0.1:4175/',
      reuseExistingServer: false,
      env: {
        VITE_DATA_MODE: 'supabase',
        VITE_SUPABASE_URL: 'https://rytta-test.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_browser_test_fixture',
        ...unconfigured,
      },
    },
  ],
  projects: [
    // RYT-116: the production build at the site root, served with the generated `_headers`.
    {
      name: 'security-headers',
      testMatch: '**/security-headers.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        baseURL: 'http://127.0.0.1:4175/',
      },
    },
    {
      name: 'desktop',
      testIgnore:
        '**/{identity,characters,character-sheet,inventory,shops,campaign-items,trades,combat,glossary,roster,bestiary,bestiary-official,encounter-builder,tabletop,username,rest,library,account,network-budget,list-scroll,overlay-back,security-headers}.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'tablet',
      testIgnore:
        '**/{identity,characters,character-sheet,inventory,shops,campaign-items,trades,combat,glossary,roster,bestiary,bestiary-official,encounter-builder,tabletop,username,rest,library,account,network-budget,list-scroll,overlay-back,security-headers}.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true },
    },
    {
      name: 'mobile',
      testIgnore:
        '**/{identity,characters,character-sheet,inventory,shops,campaign-items,trades,combat,glossary,roster,bestiary,bestiary-official,encounter-builder,tabletop,username,rest,library,account,network-budget,list-scroll,overlay-back,security-headers}.spec.ts',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    // Rytta targets phones and tablets. Signed-in journeys run at 820px and 390px; the desktop
    // project keeps only the specs with laptop-specific layout assertions.
    ...[
      {
        name: 'identity-desktop',
        viewport: { width: 1440, height: 1000 },
        // Wide layouts (>= 992px, also landscape tablets): glossary side-by-side reader and the
        // full-width tabletop library and editor.
        specs: 'identity,combat,bestiary,encounter-builder,glossary,tabletop,library',
      },
      {
        name: 'identity-tablet',
        viewport: { width: 820, height: 1180 },
        specs:
          'identity,characters,character-sheet,inventory,shops,campaign-items,trades,combat,glossary,roster,bestiary,bestiary-official,encounter-builder,tabletop,username,rest,library,legal,account,network-budget,list-scroll,overlay-back',
      },
      {
        name: 'identity-mobile',
        viewport: { width: 390, height: 844 },
        specs:
          'identity,characters,character-sheet,inventory,shops,campaign-items,trades,combat,glossary,roster,bestiary,bestiary-official,encounter-builder,tabletop,username,rest,library,legal,account,network-budget,list-scroll,overlay-back',
      },
    ].map(({ name, viewport, specs }) => ({
      name,
      testMatch: `**/{${specs}}.spec.ts`,
      use: {
        ...devices['Desktop Chrome'],
        viewport,
        hasTouch: name !== 'identity-desktop',
        baseURL: 'http://127.0.0.1:4174/rytta-dnd-app/',
      },
    })),
    ...(hasWebkit
      ? [
          { name: 'webkit-tablet', viewport: { width: 820, height: 1180 } },
          { name: 'webkit-mobile', viewport: { width: 390, height: 844 } },
        ].map(({ name, viewport }) => ({
          name,
          testMatch: '**/list-scroll.spec.ts',
          use: {
            ...devices['Desktop Safari'],
            viewport,
            baseURL: 'http://127.0.0.1:4174/rytta-dnd-app/',
          },
        }))
      : []),
  ],
})
