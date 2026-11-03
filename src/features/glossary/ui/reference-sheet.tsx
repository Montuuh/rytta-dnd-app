import { Anchor, Drawer, Loader, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { ArrowUpRight, ChevronLeft } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useGlossary } from './glossary-context'
import { EntryArticle } from './entry-article'

/**
 * The in-place definition: a bottom sheet on phones and a side sheet from 48em. Mantine's
 * Drawer traps focus, closes on Escape and returns focus to the tapped term. Terms inside a
 * definition push onto a small history with a back control.
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
  const wide = useMediaQuery('(min-width: 48em)', false)
  const heading = useRef<HTMLHeadingElement>(null)
  const id = stack.at(-1)
  const entry = id ? glossary?.catalog?.byId.get(id) : undefined
  const previous = stack.length > 1 ? glossary?.catalog?.byId.get(stack.at(-2)!) : undefined
  const body = id && glossary?.bodies ? glossary.bodies[id] : undefined
  const ready = Boolean(entry && (entry.homebrew || body))

  useEffect(() => {
    // Moving through nested terms keeps keyboard and screen reader users on the new headword.
    if (ready && stack.length > 1) heading.current?.focus()
  }, [ready, stack.length, id])

  return (
    <Drawer.Root
      opened={stack.length > 0}
      onClose={onClose}
      position={wide ? 'right' : 'bottom'}
      size={wide ? 440 : 'auto'}
      transitionProps={{ duration: 180 }}
      // Above other drawers (an item card can open a definition).
      zIndex={400}
    >
      <Drawer.Overlay />
      {/* Named after the entry; a visible title would repeat the headword below. */}
      <Drawer.Content className="gl-sheet-content" aria-label={entry?.name ?? t('module.glossary')}>
        <Drawer.Header className="gl-sheet-header">
          <span className="gl-sheet-handle" aria-hidden="true" />
          <Drawer.CloseButton aria-label={t('glossary.close')} size={44} />
        </Drawer.Header>
        <Drawer.Body className="gl-sheet-body">
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
                  headingRef={heading}
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
        </Drawer.Body>
      </Drawer.Content>
    </Drawer.Root>
  )
}
