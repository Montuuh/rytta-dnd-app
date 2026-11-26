import { Highlight } from '@mantine/core'
import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { indexLetter, type GlossaryEntry } from '../domain/catalog'
import { stripInline } from '../domain/inline'
import type { EntryBodies } from '../domain/types'
import { showTopOf } from '@/shared/ui/scroll-parent'
import { centreUntilSettled } from '@/shared/ui/centre-until-settled'
import { Windowed } from '@/shared/ui/windowed'
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
  pack,
}: {
  row: IndexRowData
  query: string
  href: string
  selected: boolean
  summary: string | null
  first?: boolean
  pack: string | null
}) {
  const { t } = useTranslation()
  const { entry, matched } = row
  const spell = entry.spell
  return (
    <li>
      <Link
        to={href}
        state={{ fromIndex: true }}
        className="gl-row"
        data-entry-id={entry.id}
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
          <span>
            {entry.feature
              ? t('glossary.spell.levelShort', { level: entry.feature.level })
              : spell
                ? spell.level === 0
                  ? t('glossary.spell.cantripShort')
                  : t('glossary.spell.levelShort', { level: spell.level })
                : entry.edition === 'homebrew'
                  ? t('glossary.homebrewTag')
                  : entry.edition === '2014'
                    ? '2014'
                    : null}
          </span>
          {pack && (
            <span className="gl-row-pack" title={pack}>
              {pack}
            </span>
          )}
        </span>
      </Link>
    </li>
  )
}

type EntryIndexProps = {
  /** Escape, or ArrowUp from the first row, returns to the search field. */
  onLeave: () => void
  rows: IndexRowData[]
  grouped: boolean
  query: string
  selectedId: string | null
  /** An entry whose row must be mounted even off screen (the one a phone reader came back from). */
  revealId?: string | null
  hrefFor: (id: string) => string
  bodies: EntryBodies | null
  /** The pack of an entry, shown quietly on its row; null (or absent) draws nothing. */
  packOf?: (entry: GlossaryEntry) => string | null
}

/** RYT-117: rows per windowed chunk of a ranked (searched) list. */
const chunkSize = 40
/** Row height before any section was measured; measured sections refine it. */
const firstRowEstimate = () => (window.innerWidth < 600 ? 88 : 74)

/** The dictionary column: alphabetical groups with a thumb index, or ranked search results. */
export const EntryIndex = forwardRef<HTMLDivElement, EntryIndexProps>(function EntryIndex(
  { rows, grouped, query, selectedId, revealId = null, hrefFor, bodies, onLeave, packOf },
  ref,
) {
  const { t } = useTranslation()
  const own = useRef<HTMLDivElement | null>(null)
  const setRef = (node: HTMLDivElement | null) => {
    own.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }
  const groups = useMemo(() => {
    if (!grouped) return null
    const map = new Map<string, IndexRowData[]>()
    for (const row of rows) {
      const letter = indexLetter(row.entry.name)
      map.set(letter, [...(map.get(letter) ?? []), row])
    }
    return [...map.entries()]
  }, [rows, grouped])
  // The sections of the list: letters, or fixed chunks of a ranked list.
  const sections = useMemo(
    () =>
      groups
        ? groups.map(([key, items]) => ({ key, items }))
        : Array.from({ length: Math.ceil(rows.length / chunkSize) }, (_, index) => ({
            key: `chunk-${index}`,
            items: rows.slice(index * chunkSize, (index + 1) * chunkSize),
          })),
    [groups, rows],
  )
  const order = useMemo(() => sections.flatMap((section) => section.items), [sections])
  const sectionOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const section of sections)
      for (const row of section.items) map.set(row.entry.id, section.key)
    return map
  }, [sections])
  // Only the latest jump or keyboard target stays mounted; the one before it is released.
  const [pinned, setPinned] = useState<string | null>(null)
  const pin = (key: string | undefined) => {
    if (key) setPinned(key)
  }
  // A new set of results starts at its top, not at the scroll offset of the list it replaced.
  const signature = `${grouped}|${rows.length}|${rows[0]?.entry.id}`
  const shownSignature = useRef(signature)
  useEffect(() => {
    if (shownSignature.current === signature) return
    shownSignature.current = signature
    if (own.current) showTopOf(own.current)
  }, [signature])
  const [rowEstimate, setRowEstimate] = useState(firstRowEstimate)
  const job = useRef<{ id: string; focus: boolean } | null>(null)
  const rowFor = (id: string) =>
    own.current?.querySelector<HTMLAnchorElement>(`.gl-row[data-entry-id="${CSS.escape(id)}"]`)
  // A row that was not mounted yet (arrow key, the open entry) is focused or scrolled to once it is.
  useEffect(() => {
    const todo = job.current
    if (!todo) return
    const row = rowFor(todo.id)
    if (!row) return
    job.current = null
    if (todo.focus) row.focus()
    else centreUntilSettled(row)
  })
  // A deep link to an entry scrolls the index to its row once.
  const scrolledTo = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedId || scrolledTo.current === selectedId || !sectionOf.has(selectedId)) return
    scrolledTo.current = selectedId
    job.current = { id: selectedId, focus: false }
  }, [selectedId, sectionOf])
  const goTo = (id: string) => {
    const row = rowFor(id)
    if (row) row.focus()
    else {
      job.current = { id, focus: true }
      pin(sectionOf.get(id))
    }
  }
  // Arrow keys move through the result rows (also the ones not mounted yet); Escape goes back to
  // the search field.
  // A row the user picked is already in view: only a link scrolls the index to its row.
  const onPick = (event: MouseEvent<HTMLDivElement>) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('.gl-row')
    if (row?.dataset.entryId) scrolledTo.current = row.dataset.entryId
  }
  const onRowsKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const row = (event.target as HTMLElement).closest<HTMLAnchorElement>('.gl-row')
    if (!row) return
    const at = order.findIndex((item) => item.entry.id === row.dataset.entryId)
    if (at < 0) return
    if (event.key === 'ArrowDown' && at < order.length - 1) {
      event.preventDefault()
      goTo(order[at + 1]!.entry.id)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (at > 0) goTo(order[at - 1]!.entry.id)
      else onLeave()
    } else if (event.key === 'Home' || event.key === 'End') {
      // As in the bestiary: the first or last row of the whole list, mounted or not.
      event.preventDefault()
      goTo(order[event.key === 'Home' ? 0 : order.length - 1]!.entry.id)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onLeave()
    }
  }
  // The thumb index is one Tab stop; arrows move between letters (roving tabindex).
  const onThumbsKey = (event: KeyboardEvent<HTMLElement>) => {
    const thumbs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.gl-thumb')]
    const at = thumbs.indexOf(event.target as HTMLButtonElement)
    const go = (index: number) => {
      event.preventDefault()
      thumbs.forEach((thumb, i) => (thumb.tabIndex = i === index ? 0 : -1))
      thumbs[index]!.focus()
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      go(Math.min(at + 1, thumbs.length - 1))
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') go(Math.max(at - 1, 0))
    else if (event.key === 'Home') go(0)
    else if (event.key === 'End') go(thumbs.length - 1)
  }
  const summaryOf = (entry: GlossaryEntry) =>
    entry.homebrew
      ? entry.homebrew.summary || stripInline(entry.homebrew.body).slice(0, 140)
      : bodies
        ? stripInline(bodies[entry.id]?.summary ?? '')
        : null
  const keepOpen = (key: string) =>
    pinned === key ||
    (selectedId !== null && sectionOf.get(selectedId) === key) ||
    (revealId !== null && sectionOf.get(revealId) === key)
  const windowed = (section: (typeof sections)[number], index: number, list: ReactNode) => (
    <Windowed
      key={section.key}
      estimate={section.items.length * rowEstimate}
      pinned={keepOpen(section.key)}
      initiallyMounted={index < 2}
      onMeasure={(height) => {
        if (section.items.length < 5) return
        const next = height / section.items.length
        setRowEstimate((prev) => (Math.abs(prev - next) < 2 ? prev : next))
      }}
    >
      {list}
    </Windowed>
  )

  if (!groups)
    return (
      <div className="gl-index" ref={setRef} onKeyDown={onRowsKey} onClickCapture={onPick}>
        {sections.map((section, sectionIndex) =>
          windowed(
            section,
            sectionIndex,
            <ol
              className="gl-rows"
              start={sectionIndex * chunkSize + 1}
              aria-label={
                sections.length === 1
                  ? t('glossary.entries')
                  : t('glossary.range', {
                      from: sectionIndex * chunkSize + 1,
                      to: sectionIndex * chunkSize + section.items.length,
                      total: rows.length,
                    })
              }
            >
              {section.items.map((row, index) => (
                <Row
                  key={row.entry.id}
                  row={row}
                  query={query}
                  href={hrefFor(row.entry.id)}
                  selected={row.entry.id === selectedId}
                  summary={summaryOf(row.entry)}
                  pack={packOf?.(row.entry) ?? null}
                  first={sectionIndex === 0 && index === 0}
                />
              ))}
            </ol>,
          ),
        )}
      </div>
    )
  return (
    <div className="gl-index" ref={setRef} onKeyDown={onRowsKey} onClickCapture={onPick}>
      <nav className="gl-thumbs" aria-label={t('glossary.letters')} onKeyDown={onThumbsKey}>
        {groups.map(([letter], index) => (
          <button
            key={letter}
            type="button"
            className="gl-thumb"
            tabIndex={index === 0 ? 0 : -1}
            onClick={() => {
              pin(letter)
              const target = document.getElementById(letterId(letter))
              if (target) centreUntilSettled(target, 'start')
              target?.focus({ preventScroll: true })
            }}
          >
            {letter}
          </button>
        ))}
      </nav>
      {sections.map((section, groupIndex) => (
        <section key={section.key} className="gl-group" aria-labelledby={letterId(section.key)}>
          <h2 className="gl-letter" id={letterId(section.key)} tabIndex={-1}>
            {section.key}
          </h2>
          {windowed(
            section,
            groupIndex,
            <ul className="gl-rows">
              {section.items.map((row, index) => (
                <Row
                  key={row.entry.id}
                  row={row}
                  query=""
                  href={hrefFor(row.entry.id)}
                  selected={row.entry.id === selectedId}
                  summary={summaryOf(row.entry)}
                  pack={packOf?.(row.entry) ?? null}
                  first={groupIndex === 0 && index === 0}
                />
              ))}
            </ul>,
          )}
        </section>
      ))}
    </div>
  )
})
