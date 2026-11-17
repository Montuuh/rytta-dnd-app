import { useState } from 'react'

/**
 * Shown when the saved language's catalogue cannot be loaded at start. No catalogue exists yet, so
 * the text is fixed in both languages and the app never renders with raw keys.
 */
export function LanguageLoadError({ retry }: { retry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <main className="fatal-error">
      <h1 role="alert">No se pudo cargar el idioma / Could not load the language</h1>
      <p lang="es">Comprueba tu conexión e inténtalo de nuevo.</p>
      <p lang="en">Check your connection and try again.</p>
      <div className="fatal-error-actions">
        <button
          type="button"
          className="fatal-error-primary"
          aria-disabled={busy || undefined}
          onClick={() => {
            if (busy) return
            setBusy(true)
            void retry().finally(() => setBusy(false))
          }}
        >
          {busy ? 'Cargando… / Loading…' : 'Reintentar / Retry'}
        </button>
      </div>
    </main>
  )
}
