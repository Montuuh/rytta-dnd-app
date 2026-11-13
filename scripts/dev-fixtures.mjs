// Starts Vite against the e2e fixture backend (fake Supabase URL and key) on port 5181, to render
// signed-in screens without Google login. Pages only show signed-in data when Playwright installs
// the fixture route mocks.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const child = spawn(
  process.execPath,
  [vite, '--port', '5181', '--strictPort', '--host', '127.0.0.1'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DATA_MODE: 'supabase',
      VITE_SUPABASE_URL: 'https://rytta-test.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_browser_test_fixture',
    },
  },
)
child.on('exit', (code) => process.exit(code ?? 0))
