import { useEffect, useRef, useState } from 'react'
import { Button, SegmentedControl, Switch, Text, TextInput } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/shared/ui/kit/item'
import { Skeleton } from '@/shared/ui/kit/skeleton'
import { cn } from '@/shared/lib/cn'
import { contentEntriesQuery, useContentAction } from '../api'
import {
  categoryGender,
  nameOf,
  type ContentEntry,
  type ContentPack,
  type PackCategory,
} from '../domain/content'
import { actionMessage } from './action-message'
import { ContentSheet } from './content-sheet'
import { EntryThumb } from './entry-thumb'
import { entryLine } from './summary'

type View = 'all' | 'hidden'

/** The words of an entry's one line: "Dragón, desafío 17", "Truco, evocación", "Armas". */
function useEntryText() {
  const { t } = useTranslation()
  return (entry: ContentEntry) => {
    const line = entryLine(entry.kind, entry.index)
    if (!line) return null
    const parts: (string | null)[] = []
    if (line.kind === 'creature') {
      parts.push(
        line.type
          ? t(`bestiary.type.${line.type}` as 'bestiary.type.beast', { defaultValue: line.type })
          : null,
        line.cr ? t('campaignContent.line.challenge', { cr: line.cr }) : null,
      )
    } else if (line.kind === 'spell') {
      parts.push(
        line.level === null
          ? null
          : line.level === 0
            ? t('glossary.spell.cantripShort')
            : t('glossary.spell.levelShort', { level: line.level }),
        line.school
          ? t(`glossary.school.${line.school}` as 'glossary.school.abjuration', {
              defaultValue: line.school,
            })
          : null,
      )
    } else {
      parts.push(
        line.category
          ? t(`inventory.category.${line.category}` as 'inventory.category.weapon', {
              defaultValue: line.category,
            })
          : null,
      )
    }
    return parts.filter(Boolean).join(', ') || null
  }
}

/**
 * RYT-184: the entries of one pack category, as the bestiary draws them (picture, name, one line)
 * with a switch each meaning "in the campaign". Search and the two views stay in view while the
 * list scrolls; "Ocultas" restores in one tap.
 */
export function EntriesSheet({
  campaignId,
  pack,
  packName,
  category,
  open,
  onClose,
  onClosed,
  finalFocus,
}: {
  campaignId: string
  pack: ContentPack
  packName: string
  category: PackCategory
  open: boolean
  onClose: () => void
  onClosed: () => void
  finalFocus?: () => HTMLElement | null
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const userId = state.user?.id
  const action = useContentAction(campaignId)
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('all')
  const [pages, setPages] = useState(1)
  // The switch answers at once; the list catches up when the campaign has been refreshed.
  const [asked, setAsked] = useState<Record<string, boolean>>({})
  const searchField = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(draft.trim())
      setPages(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [draft])
  const first = useQuery(
    contentEntriesQuery(
      userId!,
      campaignId,
      pack.id,
      category.category,
      search,
      0,
      view === 'hidden',
    ),
  )
  const gender = categoryGender(category.category)
  const categoryName = t(`campaignContent.category.${category.category}`)
  const title = t('campaignContent.entriesTitle', { category: categoryName, pack: packName })
  // Only a search has a result to announce; the list itself says when a view is empty.
  const status =
    first.data === undefined || search === ''
      ? null
      : first.data.total === 0
        ? t('campaignContent.noMatch')
        : t('campaignContent.found', { count: first.data.total })
  const hiddenTotal = first.data?.hidden_total ?? category.hidden

  const onHide = (entry: ContentEntry, hidden: boolean) => {
    const id = `${entry.kind}:${entry.key}`
    setAsked((value) => ({ ...value, [id]: hidden }))
    action.mutate(
      { kind: 'hide', packId: pack.id, entryKind: entry.kind, key: entry.key, hidden },
      {
        onSettled: () => {
          setAsked((value) => {
            const { [id]: _done, ...rest } = value
            return rest
          })
          // A row that left the view took the focus with it: the search field is the next stop.
          requestAnimationFrame(() => {
            const active = document.activeElement
            if (!active || active === document.body) searchField.current?.focus()
          })
        },
      },
    )
  }

  return (
    <ContentSheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      title={title}
      finalFocus={finalFocus}
      tall
      top={
        <div className="tw:flex tw:flex-col tw:gap-2">
          <TextInput
            ref={searchField}
            aria-label={t('campaignContent.search')}
            placeholder={t('campaignContent.search')}
            leftSection={<Search size={16} aria-hidden="true" />}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            maxLength={80}
            size="md"
          />
          <SegmentedControl
            fullWidth
            className="ink-seg content-seg"
            aria-label={t('campaignContent.views')}
            value={view}
            onChange={(value) => {
              setView(value as View)
              setPages(1)
            }}
            data={[
              {
                value: 'all',
                // The category's own count (what the card and the list reach), not the search's.
                label: t(`campaignContent.view.all.${gender}`, { count: category.entries }),
              },
              {
                value: 'hidden',
                label: t(`campaignContent.view.hidden.${gender}`, { count: hiddenTotal }),
              },
            ]}
          />
          {action.isError && (
            <Text size="sm" c="red" role="alert">
              {t(actionMessage(action.error.message))}
            </Text>
          )}
          <Text size="sm" c="dimmed" role="status" className="tw:min-h-0 tw:empty:hidden">
            {status}
          </Text>
        </div>
      }
    >
      <div>
        {Array.from({ length: pages }, (_, page) => (
          <EntriesPage
            key={`${search}-${view}-${page}`}
            campaignId={campaignId}
            pack={pack}
            category={category}
            search={search}
            view={view}
            page={page}
            last={page === pages - 1}
            asked={asked}
            busy={action.isPending}
            onMore={() => setPages((value) => value + 1)}
            onHide={onHide}
          />
        ))}
      </div>
    </ContentSheet>
  )
}

function EntriesPage({
  campaignId,
  pack,
  category,
  search,
  view,
  page,
  last,
  asked,
  busy,
  onMore,
  onHide,
}: {
  campaignId: string
  pack: ContentPack
  category: PackCategory
  search: string
  view: View
  page: number
  last: boolean
  asked: Record<string, boolean>
  busy: boolean
  onMore: () => void
  onHide: (entry: ContentEntry, hidden: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const userId = state.user?.id
  const entryText = useEntryText()
  const entries = useQuery(
    contentEntriesQuery(
      userId!,
      campaignId,
      pack.id,
      category.category,
      search,
      page,
      view === 'hidden',
    ),
  )
  const firstSwitch = useRef<HTMLInputElement>(null)
  // After "Ver más" the keyboard continues at the first new row.
  const loaded = entries.isSuccess
  useEffect(() => {
    if (page > 0 && loaded) firstSwitch.current?.focus()
  }, [page, loaded])
  if (entries.isPending)
    return (
      <div role="status" aria-label={t('common.loading')}>
        {Array.from({ length: page === 0 ? 6 : 2 }, (_, index) => (
          <div key={index} className="tw:flex tw:items-center tw:gap-3 tw:py-2.5">
            <Skeleton className="tw:size-11 tw:shrink-0" />
            <div className="tw:flex tw:flex-1 tw:flex-col tw:gap-1.5">
              <Skeleton className="tw:h-4 tw:w-2/3" />
              <Skeleton className="tw:h-3 tw:w-1/3" />
            </div>
            <Skeleton className="tw:h-6 tw:w-11 tw:rounded-full" />
          </div>
        ))}
      </div>
    )
  if (entries.isError)
    return (
      <div role="alert" className="tw:flex tw:flex-col tw:items-start tw:gap-2 tw:py-3">
        <Text size="sm">{t('campaignContent.error')}</Text>
        <Button variant="default" onClick={() => void entries.refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    )
  const { total, entries: list } = entries.data
  // A search with no result is said once, by the status line above the list.
  if (page === 0 && list.length === 0)
    return search === '' && view === 'hidden' ? (
      <Text size="sm" c="dimmed" className="tw:py-3">
        {t('campaignContent.noHidden')}
      </Text>
    ) : null
  const shown = page * 100 + list.length
  return (
    <>
      <ul className="tw:m-0 tw:list-none tw:p-0">
        {list.map((entry, index) => {
          const name = nameOf(entry, i18n.language)
          const line = entryText(entry)
          const hidden = asked[`${entry.kind}:${entry.key}`] ?? entry.hidden
          return (
            <Item
              key={`${entry.kind}:${entry.key}`}
              render={<li />}
              className="tw:flex-nowrap tw:gap-3 tw:rounded-none tw:border-0 tw:border-b tw:border-border tw:px-0 tw:py-2"
            >
              <EntryThumb entry={entry} userId={userId} />
              <ItemContent className="tw:min-w-0 tw:gap-0">
                <ItemTitle
                  className={cn(
                    'user-copy tw:line-clamp-2 tw:w-auto tw:text-base',
                    hidden && 'tw:text-muted-foreground',
                  )}
                >
                  {name}
                </ItemTitle>
                {line && <ItemDescription className="tw:text-sm">{line}</ItemDescription>}
              </ItemContent>
              <ItemActions>
                <Switch
                  ref={index === 0 ? firstSwitch : undefined}
                  className="content-switch"
                  checked={!hidden}
                  aria-disabled={busy || undefined}
                  aria-label={t('campaignContent.useEntry', { name })}
                  onChange={(event) => {
                    if (!busy) onHide(entry, !event.currentTarget.checked)
                  }}
                />
              </ItemActions>
            </Item>
          )
        })}
      </ul>
      {last && shown < total && (
        <Button variant="default" className="tw:mt-3" fullWidth onClick={onMore}>
          {t('campaignContent.more')}
        </Button>
      )}
    </>
  )
}
