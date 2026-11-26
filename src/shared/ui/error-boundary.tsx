import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArtPlate } from './art'

/** Rendered outside the router and providers: plain elements, a hash link back to the start. */
function FatalError() {
  const { t } = useTranslation()
  useEffect(() => {
    document.title = `${t('error.title')} · Rytta`
  }, [t])
  return (
    <main className="fatal-error">
      <ArtPlate name="empty/error" size={200} />
      <h1>{t('error.title')}</h1>
      <p>{t('error.help')}</p>
      <div className="fatal-error-actions">
        <button
          type="button"
          className="fatal-error-primary"
          onClick={() => window.location.reload()}
        >
          {t('error.reload')}
        </button>
        <a className="fatal-error-secondary" href={import.meta.env.BASE_URL}>
          {t('error.home')}
        </a>
      </div>
    </main>
  )
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Add redacted error reporting only after an observability decision.
  }
  render() {
    return this.state.failed ? <FatalError /> : this.props.children
  }
}
