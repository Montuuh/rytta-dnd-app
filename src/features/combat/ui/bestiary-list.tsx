import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Button, Text } from '@mantine/core'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { searchKey, type CreatureListItem } from '@/features/bestiary'
import { centreUntilSettled } from '@/shared/ui/centre-until-settled'
import { showTopOf } from '@/shared/ui/scroll-parent'
import { Windowed } from '@/shared/ui/windowed'
import { BestiaryComparisonToggle } from './bestiary-encounter'
import { FavouriteMark } from './bestiary-widgets'
import { typeGlyphs } from './bestiary-glyphs'
import { itemArt } from './creatures'
import { JumpIndex } from './jump-index'
import { Token } from './token'

type Grouping = 'letter' | 'cr' | null

/** Without a query the list reads like an index: letter rules by name, CR rules by challenge. */
function groupsOf(
  items: CreatureListItem[],
  grouping: Grouping,
  noCr: string,
  crLabel: (cr: string) => string,
) {
  if (!grouping) return [{ key: 'all', label: null as string | null, items }]
  // Groups are merged by key, so unsorted input never repeats a letter or a challenge rating.
  const byKey = new Map<string, { key: string; label: string | null; items: CreatureListItem[] }>()
  for (const item of items) {
    const key =
      grouping === 'cr'
        ? (item.cr ?? '-')
        : /^\p{L}/u.test(searchKey(item.name))
          ? searchKey(item.name)[0]!.toLocaleUpperCase()
          : '#'
    const group = byKey.get(key)
    if (group) group.items.push(item)
    else
      byKey.set(key, {
        key,
        label: grouping === 'cr' ? (item.cr === null ? noCr : crLabel(item.cr)) : key,
        items: [item],
      })
  }
  const groups = [...byKey.values()]
  return groups
}

/** Rows per spacer-backed chunk when a flat (searched) list has no letter or CR groups. */
const chunkSize = 40
/** Row height before any section was measured; measured sections refine it. */
const firstRowEstimate = () => 58

export function CreatureList({
  items,
  grouping,
  selectedKey,
  followSelection,
  comparisonKeys,
  toggleComparison,
  select,
  emptyText,
  clear,
  showPack,
  favorites,
}: {
  /** A favourite creature carries a small bookmark at the end of its name. */
  favorites: ReadonlySet<string>
  /** RYT-094: several creature packs are enabled: each pack creature names its pack. */
  showPack: boolean
  items: CreatureListItem[]
  grouping: Grouping
  selectedKey: string | null
  /** Beside the stat block: moving with the arrow keys opens the creature the focus reaches. */
  followSelection: boolean
  comparisonKeys?: readonly string[]
  toggleComparison: (key: string) => void
  select: (key: string, target: HTMLElement) => void
  emptyText: string
  clear: () => void
}) {
  const { t } = useTranslation()
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const groups = useMemo(() => {
    const grouped = groupsOf(items, grouping, t('bestiary.group.noCr'), (cr) =>
      t('bestiary.crShort', { cr }),
    )
    // RYT-117: a long flat result is cut into chunks, each its own windowed list.
    if (grouping !== null || items.length <= chunkSize) return grouped
    return Array.from({ length: Math.ceil(items.length / chunkSize) }, (_, index) => ({
      key: `chunk-${index}`,
      label: null as string | null,
      items: items.slice(index * chunkSize, (index + 1) * chunkSize),
    }))
  }, [items, grouping, t])
  const groupOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const group of groups) for (const item of group.items) map.set(item.key, group.key)
    return map
  }, [groups])
  // Groups that stay mounted off screen: the open creature's, plus a jump or keyboard target's.
  // Only the latest jump or keyboard target stays mounted; the one before it is released.
  const [pinned, setPinned] = useState<string | null>(null)
  const pin = (key: string | undefined) => {
    if (key) setPinned(key)
  }
  // A new set of results starts at its top, not at the scroll offset of the list it replaced.
  const signature = `${grouping}|${items.length}|${items[0]?.key}`
  const shownSignature = useRef(signature)
  useEffect(() => {
    if (shownSignature.current === signature) return
    shownSignature.current = signature
    if (listRef.current) showTopOf(listRef.current)
  }, [signature])
  const [rowEstimate, setRowEstimate] = useState(firstRowEstimate)
  const job = useRef<{ key: string; focus: boolean } | null>(null)
  // A row that was not mounted yet (deep link, End key) is focused or scrolled to once it is.
  useEffect(() => {
    const todo = job.current
    if (!todo) return
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-row-key="${CSS.escape(todo.key)}"]`,
    )
    if (!row) return
    job.current = null
    if (todo.focus) row.querySelector<HTMLElement>('.bst-row-main')?.focus()
    else centreUntilSettled(row)
  })
  // The open creature's row is scrolled into view when it was reached by a link.
  const scrolledTo = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedKey || scrolledTo.current === selectedKey || !groupOf.has(selectedKey)) return
    scrolledTo.current = selectedKey
    job.current = { key: selectedKey, focus: false }
  }, [selectedKey, groupOf])
  const countLine = (
    <p className="bst-count-line" role="status" aria-live="polite">
      {t('bestiary.count', { count: items.length })}
    </p>
  )
  if (items.length === 0)
    return (
      <div className="bst-empty">
        {countLine}
        <span className="bst-detail-empty-icon" aria-hidden="true">
          <Search size={22} />
        </span>
        <Text fw={600}>{emptyText}</Text>
        <Button variant="light" onClick={clear}>
          {t('bestiary.filter.reset')}
        </Button>
      </div>
    )
  const goTo = (key: string) => {
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-row-key="${CSS.escape(key)}"] .bst-row-main`,
    )
    if (row) row.focus()
    else {
      job.current = { key, focus: true }
      pin(groupOf.get(key))
    }
  }
  // Arrow keys move between rows across groups (from a row or its picture); Home and End jump to
  // the ends. They follow the data, so a row that is not mounted yet is reached too.
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const active = document.activeElement
    if (!active?.matches('.bst-row-main, .combat-token-open')) return
    const current = active.closest('[data-row-key]')?.getAttribute('data-row-key')
    const at = items.findIndex((item) => item.key === current)
    if (at < 0) return
    event.preventDefault()
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : Math.max(0, Math.min(items.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))
    goTo(items[next]!.key)
    if (followSelection && next !== at) select(items[next]!.key, active as HTMLElement)
  }
  const jumpTo = (index: number) => {
    pin(groups[index]?.key)
    const head = document.getElementById(`${listId}-${index}`)
    if (head) centreUntilSettled(head, 'start')
    head?.focus({ preventScroll: true })
  }
  const row = (item: CreatureListItem) => {
    const current = item.key === selectedKey
    const art = itemArt(item)
    return (
      <li
        key={item.key}
        data-row-key={item.key}
        className="bst-row"
        data-current={current || undefined}
      >
        <button
          type="button"
          className="bst-row-main"
          aria-current={current ? 'true' : undefined}
          onClick={(event) => {
            // A row the user picked is already in view: only a link scrolls the list to its row.
            scrolledTo.current = item.key
            select(item.key, event.currentTarget)
          }}
        >
          <Token
            name={item.name}
            side={item.side ?? 'enemy'}
            imageKind="creature"
            path={item.imagePath ?? item.packPath ?? null}
            art={art?.thumb}
            size={32}
            glyph={item.type ? typeGlyphs[item.type] : undefined}
          />
          <span className="bst-row-text">
            <span className="bst-row-name">
              {item.name}
              {favorites.has(item.key) && <FavouriteMark size={14} />}
            </span>
            <span className="bst-row-meta">
              {[
                showPack ? item.pack : null,
                item.type ? t(`bestiary.type.${item.type}`) : null,
                t('bestiary.rowNumbers', { ac: item.ac, hp: item.hp }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          {item.cr !== null && (
            <span className="bst-cr tabular">
              <span className="visually-hidden"> · </span>
              {t('bestiary.crShort', { cr: item.cr })}
            </span>
          )}
        </button>
        {comparisonKeys && (
          <BestiaryComparisonToggle item={item} keys={comparisonKeys} onToggle={toggleComparison} />
        )}
      </li>
    )
  }
  const windowed = (group: (typeof groups)[number], index: number, list: ReactNode) => (
    <Windowed
      estimate={group.items.length * rowEstimate}
      pinned={
        pinned === group.key || (selectedKey !== null && groupOf.get(selectedKey) === group.key)
      }
      initiallyMounted={index < 2}
      onMeasure={(height) => {
        if (group.items.length < 5) return
        const next = height / group.items.length
        setRowEstimate((prev) => (Math.abs(prev - next) < 2 ? prev : next))
      }}
    >
      {list}
    </Windowed>
  )
  return (
    <div className="bst-list" ref={listRef} onKeyDown={onKey}>
      <div className="bst-index-row">
        {countLine}
        {grouping !== null && groups.length > 1 && (
          <JumpIndex
            label={t('bestiary.jump')}
            items={groups.map((group) => group.label ?? group.key)}
            onJump={jumpTo}
          />
        )}
      </div>
      {groups.map((group, index) =>
        group.label === null ? (
          <div key={group.key}>
            {windowed(
              group,
              index,
              <ul
                className="bst-items"
                aria-label={
                  groups.length === 1
                    ? t('bestiary.listLabel')
                    : t('bestiary.range', {
                        from: index * chunkSize + 1,
                        to: index * chunkSize + group.items.length,
                        total: items.length,
                      })
                }
              >
                {group.items.map(row)}
              </ul>,
            )}
          </div>
        ) : (
          <div key={group.key} className="bst-group">
            <h3 className="bst-group-head" id={`${listId}-${index}`} tabIndex={-1}>
              <span>{group.label}</span>
              <span className="bst-group-count tabular">
                <span aria-hidden="true">{group.items.length}</span>
                <span className="visually-hidden">
                  {t('bestiary.group.size', { count: group.items.length })}
                </span>
              </span>
            </h3>
            {windowed(
              group,
              index,
              <ul className="bst-items" aria-labelledby={`${listId}-${index}`}>
                {group.items.map(row)}
              </ul>,
            )}
          </div>
        ),
      )}
    </div>
  )
}
