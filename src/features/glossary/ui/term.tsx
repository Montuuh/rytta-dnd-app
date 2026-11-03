import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { parseInline } from '../domain/inline'
import type { Linker } from '../domain/linker'
import { useGlossary } from './glossary-context'

/**
 * An inline glossary reference. It opens the definition in place (bottom sheet on phones,
 * side sheet on tablets). Without a glossary layer, or for an unknown id, it is plain text.
 */
export function GlossaryTerm({
  id,
  children,
  className,
}: {
  id: string
  children: ReactNode
  className?: string
}) {
  const glossary = useGlossary()
  const { t } = useTranslation()
  if (!glossary || (glossary.catalog && !glossary.catalog.byId.has(id)))
    return <span className={className}>{children}</span>
  const label =
    typeof children === 'string' || typeof children === 'number'
      ? t('glossary.termHint', { name: String(children) })
      : undefined
  return (
    <button
      type="button"
      className={['glossary-term', className].filter(Boolean).join(' ')}
      aria-haspopup="dialog"
      aria-label={label}
      data-glossary-id={id}
      onClick={(event) => {
        event.stopPropagation()
        glossary.open(id)
      }}
      onPointerEnter={glossary.requestBodies}
      onFocus={glossary.requestBodies}
    >
      {children}
    </button>
  )
}

function linked(
  text: string,
  linker: Linker | null | undefined,
  seen: Set<string>,
  selfId: string | undefined,
  key: string,
): ReactNode[] {
  if (!linker) return [text]
  return linker.link(text, { selfId, seen }).map((segment, index) =>
    segment.id ? (
      <GlossaryTerm key={`${key}-${index}`} id={segment.id}>
        {segment.text}
      </GlossaryTerm>
    ) : (
      <Fragment key={`${key}-${index}`}>{segment.text}</Fragment>
    ),
  )
}

/**
 * Plain user text with automatic links to glossary terms (each term once per block; an entry
 * never links to itself). Linking is computed within this render, so it stays pure.
 * Never renders HTML.
 */
export function GlossaryText({ text, selfId }: { text: string; selfId?: string }) {
  const glossary = useGlossary()
  return <>{linked(text, glossary?.linker, new Set(), selfId, 't')}</>
}

/** Bundled SRD text: inline emphasis plus links. An emphasized exact name (a spell) links whole. */
export function RulesText({ text, selfId }: { text: string; selfId?: string }) {
  const glossary = useGlossary()
  const linker = glossary?.linker
  const seen = new Set<string>()
  return (
    <>
      {parseInline(text).map((segment, index) => {
        if (segment.kind === 'strong')
          return (
            <strong key={index}>{linked(segment.text, linker, seen, selfId, `s${index}`)}</strong>
          )
        if (segment.kind === 'em') {
          const id = linker?.lookup(segment.text)
          if (id && id !== selfId && !seen.has(id)) {
            seen.add(id)
            return (
              <em key={index}>
                <GlossaryTerm id={id}>{segment.text}</GlossaryTerm>
              </em>
            )
          }
          return <em key={index}>{segment.text}</em>
        }
        return (
          <Fragment key={index}>{linked(segment.text, linker, seen, selfId, `x${index}`)}</Fragment>
        )
      })}
    </>
  )
}

/**
 * For user-named things (a spell written on a sheet): when the name matches a bundled entry,
 * show a link to its SRD definition. Renders nothing otherwise.
 */
export function GlossaryNameLink({ name }: { name: string }) {
  const glossary = useGlossary()
  const { t } = useTranslation()
  const id = glossary?.linker?.lookup(name)
  const entry = id ? glossary?.catalog?.byId.get(id) : undefined
  if (!entry || entry.source !== 'srd') return null
  return (
    <p className="gl-name-link">
      {t('glossary.srdDefinition')} <GlossaryTerm id={entry.id}>{entry.name}</GlossaryTerm>
    </p>
  )
}
