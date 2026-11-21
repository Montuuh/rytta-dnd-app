import './shared/lib/zod-jitless'
import { StrictMode } from 'react'
import { startI18n } from './shared/i18n'
import { LanguageLoadError } from './shared/i18n/load-error'
import { createRoot } from 'react-dom/client'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './app/styles.css'
import './app/class-themes.css'
import { App } from './app/app'
import { registerOfflineShell } from './shared/lib/offline-shell'

// The saved language's catalogue is one lazy chunk: render only once it is in, so no key shows
// raw. When it cannot be fetched a fixed bilingual screen offers a retry instead.
const root = createRoot(document.getElementById('root')!)
function show(ready: boolean) {
  root.render(
    ready ? (
      <StrictMode>
        <App />
      </StrictMode>
    ) : (
      <LanguageLoadError retry={async () => show(await startI18n())} />
    ),
  )
}
void startI18n().then(show)
registerOfflineShell(import.meta.env.BASE_URL, import.meta.env.PROD)
