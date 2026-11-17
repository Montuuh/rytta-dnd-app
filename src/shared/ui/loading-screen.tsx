import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { artUrl } from './art-url'

/** After this long without the app opening, the screen offers a way out. */
const STALLED_AFTER_MS = 8000

/** Shown before the router exists, so it uses plain elements and the static emblem. */
export function LoadingScreen() {
  const { t } = useTranslation()
  const [stalled, setStalled] = useState(false)
  useEffect(() => {
    // Restore the page's own title when the screen goes away (it can show inside a loaded shell).
    const previous = document.title
    document.title = `${t('common.loading')} · Rytta`
    const timer = window.setTimeout(() => setStalled(true), STALLED_AFTER_MS)
    return () => {
      window.clearTimeout(timer)
      if (document.title === `${t('common.loading')} · Rytta`) document.title = previous
    }
  }, [t])
  return (
    <div className="loading-screen">
      <img
        className="loading-emblem"
        src={artUrl('brand/emblem')}
        alt=""
        width={72}
        height={72}
        draggable={false}
      />
      <p role="status">{stalled ? t('common.loadingSlow') : t('common.loading')}</p>
      {stalled && (
        <div className="fatal-error-actions">
          <button
            type="button"
            className="fatal-error-primary"
            onClick={() => window.location.reload()}
          >
            {t('error.reload')}
          </button>
          <a className="fatal-error-secondary" href={`${import.meta.env.BASE_URL}#/`}>
            {t('error.home')}
          </a>
        </div>
      )}
    </div>
  )
}
