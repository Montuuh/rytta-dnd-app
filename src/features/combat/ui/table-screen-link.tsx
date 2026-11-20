import { useEffect, useRef } from 'react'
import { Button } from '@mantine/core'
import { Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'

/** Set when a Player leaves for the table screen, so focus is back on the link when they return. */
let focusOnReturn = false

/** A Player opens the table screen in the same tab and returns to the link with focus intact. */
export function TableScreenLink({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    if (!focusOnReturn) return
    focusOnReturn = false
    // The route change hands focus to the page's main region right after this mounts: that is the
    // fall-back to undo, and the helper gives up if the person moves on to another control.
    focusWhenReady(() => ref.current, { from: document.getElementById('main-content') })
  }, [])
  return (
    <Button
      variant="default"
      size="md"
      className="combat-table-screen"
      leftSection={<Monitor size={20} aria-hidden="true" />}
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
