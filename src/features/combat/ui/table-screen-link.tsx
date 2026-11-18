import { useEffect, useRef } from 'react'
import { Button, VisuallyHidden } from '@mantine/core'
import { Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'

/** Set when a Player leaves for the table screen, so focus is back on the link when they return. */
let focusOnReturn = false

/**
 * The way to the table screen (RYT-131). A Player goes in the same tab and, coming back, finds focus
 * on this link. The DM's launch opens a new tab: the screen is for a shared display, and a stray
 * key there must not land on the DM's own interface.
 */
export function TableScreenLink({ campaignId, newTab }: { campaignId: string; newTab: boolean }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    if (!focusOnReturn || newTab) return
    focusOnReturn = false
    // The route change hands focus to the page's main region right after this mounts: that is the
    // fall-back to undo, and the helper gives up if the person moves on to another control.
    focusWhenReady(() => ref.current, { from: document.getElementById('main-content') })
  }, [newTab])
  const common = {
    variant: 'default',
    size: 'md',
    className: 'combat-table-screen',
    leftSection: <Monitor size={20} aria-hidden="true" />,
  } as const
  return newTab ? (
    <Button
      {...common}
      component="a"
      href={`#/campaign/${campaignId}/tabletop-table`}
      target="_blank"
      rel="noopener"
    >
      {t('combat.table.screen')}
      <VisuallyHidden>{t('combat.table.newTab')}</VisuallyHidden>
    </Button>
  ) : (
    <Button
      {...common}
      component={Link}
      to={`/campaign/${campaignId}/tabletop-table`}
      ref={ref}
      onClick={() => {
        focusOnReturn = true
      }}
    >
      {t('combat.table.screen')}
    </Button>
  )
}
