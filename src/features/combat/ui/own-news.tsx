import { ActionIcon, Portal, VisuallyHidden } from '@mantine/core'
import { Bell, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { News } from './use-own-news'

/**
 * The notice and its polite live region. The region is always mounted so assistive tech announces
 * the text when it changes; the visible notice floats above the bottom navigation on phones.
 */
export function OwnNews({ news, dismiss }: { news: News | null; dismiss: () => void }) {
  const { t } = useTranslation()
  const text = news?.lines.join('. ') ?? ''
  return (
    <>
      <VisuallyHidden aria-live="polite">{text}</VisuallyHidden>
      {news && (
        <Portal>
          <div className="combat-news" key={news.id}>
            <Bell size={20} aria-hidden="true" />
            <ul>
              {news.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <ActionIcon
              variant="subtle"
              size={44}
              aria-label={t('combat.news.close')}
              onClick={dismiss}
            >
              <X size={18} aria-hidden="true" />
            </ActionIcon>
          </div>
        </Portal>
      )}
    </>
  )
}
