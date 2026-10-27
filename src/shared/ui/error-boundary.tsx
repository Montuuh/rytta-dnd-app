import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

function FatalError() {
  const { t } = useTranslation()
  return (
    <main className="fatal-error">
      <h1>{t('error.title')}</h1>
      <p>{t('error.help')}</p>
      <button onClick={() => window.location.reload()}>{t('error.reload')}</button>
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
