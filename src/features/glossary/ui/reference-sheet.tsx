import { Anchor, Drawer, Loader, Text } from '@mantine/core'
import { usePhone } from '@/shared/ui/use-viewport'
import { ArrowUpRight, ChevronLeft } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useGlossary } from './glossary-context'
import { EntryArticle } from './entry-article'

/**
 * The in-place definition: a bottom sheet on phones and a side sheet from 48em. Mantine's
 * Drawer traps focus, closes on Escape and returns focus to the tapped term. The drawer title
 * is the entry's headword (it names the dialog); terms inside a definition push onto a small
 * history with a back control, and every move through that history focuses the headword.
 */
export function ReferenceSheet({
  stack,
  onBack,
  onClose,
}: {
  stack: string[]
  onBack: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const glossary = useGlossary()
  const wide = !usePhone()
  const heading = useRef<HTMLSpanElement>(null)
  const depth = useRef(0)
  const id = stack.at(-1)
  const entry = id ? glossary?.catalog?.byId.get(id) : undefined
  const previous = stack.length > 1 ? glossary?.catalog?.byId.get(stack.at(-2)!) : undefined
  const body = id && glossary?.bodies ? glossary.bodies[id] : undefined
  const ready = Boolean(entry && (entry.homebrew || body))

  useEffect(() => {
    // Opening is handled by the drawer's focus trap; moving forward or back in the history
    // keeps keyboard and screen reader users on the new headword.
    if (depth.current > 0 && stack.length > 0 && stack.length !== depth.current)
      heading.current?.focus()
    depth.current = stack.length
  }, [stack.length])

  const open = stack.length > 0

  return (
    <Drawer
      opened={open}
      onClose={onClose}
      closeOnEscape={false}
      position={wide ? 'right' : 'bottom'}
      size={wide ? 440 : 'auto'}
      transitionProps={{ duration: 180 }}
      // Above other drawers (an item card can open a definition).
      zIndex={400}
      classNames={{
        content: 'gl-sheet-content',
        header: 'gl-sheet-header',
        title: 'gl-sheet-title',
        body: 'gl-sheet-body',
      }}
      title={
        <span ref={heading} tabIndex={-1} className="gl-sheet-headword">
          {entry?.name ?? t('module.glossary')}
        </span>
      }
      closeButtonProps={{ 'aria-label': t('glossary.close'), size: 44 }}
    >
      {previous && (
        <button type="button" className="gl-sheet-back" onClick={onBack}>
          <ChevronLeft size={18} aria-hidden="true" />
          {t('glossary.backTo', { name: previous.name })}
        </button>
      )}
      {!entry && glossary?.catalog ? (
        <Text>{t('glossary.notFound')}</Text>
      ) : !ready ? (
        glossary?.bodiesError || glossary?.indexError ? (
          <Text>{t('glossary.loadError')}</Text>
        ) : (
          <div className="gl-loading" role="status">
            <Loader size="sm" />
            <Text>{t('glossary.loading')}</Text>
          </div>
        )
      ) : (
        entry && (
          <>
            <EntryArticle
              entry={entry}
              body={body}
              houseRules={glossary?.catalog?.houseRules.get(entry.id)}
              headingLevel={2}
              hideHeadword
              compact
            />
            {glossary?.pagePath && (
              <Anchor
                component={Link}
                to={`${glossary.pagePath}/${encodeURIComponent(entry.id)}`}
                onClick={onClose}
                className="gl-open-page"
              >
                {t('glossary.open')}
                <ArrowUpRight size={16} aria-hidden="true" />
              </Anchor>
            )}
          </>
        )
      )}
    </Drawer>
  )
}
