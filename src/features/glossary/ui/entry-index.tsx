import { Highlight } from '@mantine/core'
import { forwardRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { indexLetter, type GlossaryEntry } from '../domain/catalog'
import { stripInline } from '../domain/inline'
import type { EntryBodies } from '../domain/types'
import { CategoryIcon } from './icons'

export type IndexRowData = { entry: GlossaryEntry; matched: string | null }

const letterId = (letter: string) => `gl-letter-${letter === '#' ? 'num' : letter}`

function Row({
  row,
  query,
  href,
  selected,
  summary,
  first,
}: {
  row: IndexRowData
  query: string
  href: string
  selected: boolean
  summary: string | null
  first?: boolean
}) {
  const { t } = useTranslation()
  const { entry, matched } = row
  const spell = entry.spell
  return (
    <li>
      <Link
        to={href}
        className="gl-row"
        aria-current={selected ? 'true' : undefined}
        data-first-result={first || undefined}
      >
        <span className="gl-row-glyph">
          <CategoryIcon category={entry.category} size={18} />
        </span>
        <span className="gl-row-main">
          <span className="gl-row-name">
            <Highlight component="span" highlight={query} className="gl-row-highlight">
              {entry.name}
            </Highlight>
            {matched && <span className="gl-row-matched">{matched}</span>}
          </span>
          {summary !== null ? (
            <span className="gl-row-summary">{summary}</span>
          ) : (
            <span className="gl-row-summary gl-row-pending" aria-hidden="true" />
          )}
        </span>
        <span className="gl-row-meta">
          {spell
            ? spell.level === 0
              ? t('glossary.spell.cantripShort')
              : t('glossary.spell.levelShort', { level: spell.level })
            : entry.edition === 'homebrew'
              ? t('glossary.homebrewTag')
              : entry.edition === '2014'
                ? '2014'
                : null}
        </span>
      </Link>
    </li>
  )
}

type EntryIndexProps = {
  rows: IndexRowData[]
  grouped: boolean
  query: string
  selectedId: string | null
  hrefFor: (id: string) => string
  bodies: EntryBodies | null
}

/** The dictionary column: alphabetical groups with a thumb index, or ranked search results. */
export const EntryIndex = forwardRef<HTMLDivElement, EntryIndexProps>(function EntryIndex(
  { rows, grouped, query, selectedId, hrefFor, bodies },
  ref,
) {
  const { t } = useTranslation()
  const groups = useMemo(() => {
    if (!grouped) return null
    const map = new Map<string, IndexRowData[]>()
    for (const row of rows) {
      const letter = indexLetter(row.entry.name)
      map.set(letter, [...(map.get(letter) ?? []), row])
    }
    return [...map.entries()]
  }, [rows, grouped])
  const summaryOf = (entry: GlossaryEntry) =>
    entry.homebrew
      ? entry.homebrew.summary || stripInline(entry.homebrew.body).slice(0, 140)
      : bodies
        ? stripInline(bodies[entry.id]?.summary ?? '')
        : null

  if (!groups)
    return (
      <div className="gl-index" ref={ref}>
        <ol className="gl-rows" aria-label={t('glossary.entries')}>
          {rows.map((row, index) => (
            <Row
              key={row.entry.id}
              row={row}
              query={query}
              href={hrefFor(row.entry.id)}
              selected={row.entry.id === selectedId}
              summary={summaryOf(row.entry)}
              first={index === 0}
            />
          ))}
        </ol>
      </div>
    )
  return (
    <div className="gl-index" ref={ref}>
      <nav className="gl-thumbs" aria-label={t('glossary.letters')}>
        {groups.map(([letter]) => (
          <button
            key={letter}
            type="button"
            className="gl-thumb"
            onClick={() => {
              const target = document.getElementById(letterId(letter))
              target?.scrollIntoView({ block: 'start' })
              target?.focus({ preventScroll: true })
            }}
          >
            {letter}
          </button>
        ))}
      </nav>
      {groups.map(([letter, items], groupIndex) => (
        <section key={letter} className="gl-group" aria-labelledby={letterId(letter)}>
          <h2 className="gl-letter" id={letterId(letter)} tabIndex={-1}>
            {letter}
          </h2>
          <ul className="gl-rows">
            {items.map((row, index) => (
              <Row
                key={row.entry.id}
                row={row}
                query=""
                href={hrefFor(row.entry.id)}
                selected={row.entry.id === selectedId}
                summary={summaryOf(row.entry)}
                first={groupIndex === 0 && index === 0}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
})
