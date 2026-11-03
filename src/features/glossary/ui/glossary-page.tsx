import {
  ActionIcon,
  Anchor,
  Button,
  Checkbox,
  CloseButton,
  Drawer,
  Group,
  Kbd,
  Loader,
  Menu,
  Modal,
  RangeSlider,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { PageHead } from '@/shared/ui/page-head'
import { usePhone, useWide } from '@/shared/ui/use-viewport'
import { notifications } from '@mantine/notifications'
import {
  ChevronLeft,
  Ellipsis,
  Pencil,
  Plus,
  ScrollText,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useHomebrewAction } from '../api'
import type { GlossaryEntry } from '../domain/catalog'
import { GlossaryError, homebrewEntryId, type HomebrewEntry } from '../domain/homebrew'
import { searchGlossary } from '../domain/search'
import { spellClasses, spellSchools, type SpellClass, type SpellSchool } from '../domain/types'
import { EntryArticle } from './entry-article'
import { EntryIndex, type IndexRowData } from './entry-index'
import { useGlossary } from './glossary-context'
import { HomebrewEditor, type EditorTarget } from './homebrew-editor'
import {
  activeFilterCount,
  matchesSpellFilters,
  noSpellFilters,
  type SpellFilters,
} from './spell-filters'
import { glossaryTabs, inTab, isGlossaryTab, type GlossaryTab } from './tabs'

const conditionsAtTheTable = [
  'condition.grappled',
  'condition.prone',
  'condition.restrained',
  'condition.frightened',
  'condition.poisoned',
  'condition.incapacitated',
  'condition.invisible',
  'condition.exhaustion',
]

/** The entry last read on its own (phone) route; the index returns focus to its row. */
let lastReaderEntry: string | null = null
/**
 * Set by Enter in search and by saving homebrew to the entry about to open: it takes focus on
 * its headword. Module state, because the navigation can remount the page, and an id, because
 * the old entry can re-render before the (transitioned) navigation commits.
 */
let focusHeadwordOf: string | null = null

/** RYT-008 glossary: search, categories, alphabetical index and a reader for one entry. */
export function GlossaryPage() {
  const { t } = useTranslation()
  const glossary = useGlossary()
  const { entryId: rawEntryId } = useParams()
  const entryId = rawEntryId ? decodeURIComponent(rawEntryId) : null
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const wide = useWide()
  const searchRef = useRef<HTMLInputElement>(null)
  const indexRef = useRef<HTMLDivElement>(null)
  const readerHeading = useRef<HTMLHeadingElement>(null)
  const [filters, setFilters] = useState<SpellFilters>(noSpellFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [editor, setEditorState] = useState<EditorTarget | null>(null)
  const [editorReturnFocus, setEditorReturnFocus] = useState(true)
  const setEditor = (target: EditorTarget | null) => {
    if (target) setEditorReturnFocus(true)
    setEditorState(target)
  }
  const [deleting, setDeleting] = useState<HomebrewEntry | null>(null)
  // The field owns what is typed; the URL only mirrors it for deep links. Driving the input
  // from the URL dropped keystrokes while the 550-row list re-rendered (ui-ux F1).
  const urlQuery = params.get('q') ?? ''
  const [query, setQuery] = useState(urlQuery)
  // What this page last wrote to ?q= and what it last saw there: a ?q= change it did not
  // write (the nav item, a link) replaces the typed text (ui-ux R2-2).
  const [writtenQuery, setWrittenQuery] = useState(urlQuery)
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery)
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery)
    if (urlQuery !== writtenQuery) {
      setQuery(urlQuery)
      setWrittenQuery(urlQuery)
    }
  }
  const deferredQuery = useDeferredValue(query)
  useEffect(() => {
    const value = query.trim() ? query : ''
    if (value === urlQuery) return
    // Tied to the current path: navigating (Enter, a row) cancels a pending mirror, which
    // would otherwise replace the new entry URL with the index URL it was scheduled from.
    const scheduledPath = location.pathname
    const handle = window.setTimeout(() => {
      // A navigation can still be rendering (router transitions): the address bar already
      // shows the new path, and writing ?q= now would send it back to this page's path.
      const currentPath = window.location.hash.replace(/^#/, '').split('?')[0]
      if (currentPath !== scheduledPath) return
      setWrittenQuery(value)
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (value) next.set('q', value)
          else next.delete('q')
          return next
        },
        { replace: true },
      )
    }, 300)
    return () => window.clearTimeout(handle)
  }, [query, urlQuery, setParams, location.pathname])
  const tab: GlossaryTab = isGlossaryTab(params.get('cat'))
    ? (params.get('cat') as GlossaryTab)
    : 'all'
  const catalog = glossary?.catalog ?? null
  const requestBodies = glossary?.requestBodies
  const remember = glossary?.remember
  const bodies = glossary?.bodies ?? null

  useEffect(() => requestBodies?.(), [requestBodies])
  useEffect(() => {
    if (entryId && catalog?.byId.has(entryId)) remember?.(entryId)
  }, [entryId, catalog, remember])
  useEffect(() => {
    // A new entry on its own (phone) route, or one opened with Enter or just saved, moves focus
    // to its headword. The next frame runs after the layout's own route-change focus.
    if (!entryId || !(!wide || focusHeadwordOf === entryId)) return
    const frame = requestAnimationFrame(() => {
      if (!readerHeading.current) return
      readerHeading.current.focus()
      if (focusHeadwordOf === entryId) focusHeadwordOf = null
    })
    return () => cancelAnimationFrame(frame)
  }, [entryId, wide, catalog])
  useEffect(() => {
    if (wide) return
    if (entryId) {
      lastReaderEntry = entryId
      return
    }
    // Back on the index: keep the reader's place by focusing the row it came from (after the
    // layout's route-change scroll and focus, hence the next frame).
    if (!lastReaderEntry || !catalog) return
    const frame = requestAnimationFrame(() => {
      const row = indexRef.current?.querySelector<HTMLAnchorElement>(
        `[data-entry-id="${CSS.escape(lastReaderEntry ?? '')}"]`,
      )
      if (!row) return
      row.scrollIntoView({ block: 'center' })
      row.focus({ preventScroll: true })
      lastReaderEntry = null
    })
    return () => cancelAnimationFrame(frame)
  }, [entryId, wide, catalog])
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]') !==
        null
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const matches = useMemo<IndexRowData[]>(() => {
    if (!catalog) return []
    const summaries = bodies
      ? Object.fromEntries(Object.entries(bodies).map(([id, b]) => [id, b.summary]))
      : undefined
    return deferredQuery.trim()
      ? searchGlossary(catalog, deferredQuery, { summaries }).map((hit) => ({
          entry: hit.entry,
          matched: hit.matched,
        }))
      : catalog.entries.map((entry) => ({ entry, matched: null }))
  }, [catalog, bodies, deferredQuery])
  const rows = useMemo(
    () =>
      matches.filter(
        ({ entry }) =>
          inTab(entry, tab) && (tab !== 'spell' || matchesSpellFilters(entry, filters)),
      ),
    [matches, tab, filters],
  )
  // Tab counts follow the current search, so a tab shows how many matches it holds.
  const counts = useMemo(() => {
    const out: Record<GlossaryTab, number> = {
      all: 0,
      condition: 0,
      action: 0,
      rule: 0,
      spell: 0,
      homebrew: 0,
    }
    for (const { entry } of matches)
      for (const key of glossaryTabs) if (inTab(entry, key)) out[key]++
    return out
  }, [matches])
  const homebrewTotal = catalog?.entries.filter((e) => e.source === 'homebrew').length ?? 0

  if (!glossary) return null
  if (!glossary.pagePath)
    return (
      <Stack className="gl-page">
        <Title order={1}>{t('module.glossary')}</Title>
        <p className="gl-quiet-note">{t('glossary.hiddenModule')}</p>
      </Stack>
    )
  const pagePath = glossary.pagePath
  const keepParams = new URLSearchParams()
  if (query.trim()) keepParams.set('q', query)
  if (tab !== 'all') keepParams.set('cat', tab)
  const keep = keepParams.toString()
  const hrefFor = (id: string) => `${pagePath}/${encodeURIComponent(id)}${keep ? `?${keep}` : ''}`
  const indexHref = `${pagePath}${keep ? `?${keep}` : ''}`

  const setParam = (key: string, value: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  if (glossary.indexError)
    return (
      <Stack className="gl-page">
        <Title order={1}>{t('module.glossary')}</Title>
        <p className="gl-quiet-note" role="alert">
          {t('glossary.loadError')}
        </p>
        <Button variant="light" w="fit-content" onClick={glossary.retry}>
          {t('glossary.retry')}
        </Button>
      </Stack>
    )
  if (!catalog)
    return (
      <div className="gl-loading" role="status">
        <Loader size="sm" />
        <Text>{t('glossary.loading')}</Text>
      </div>
    )

  const selected = entryId ? (catalog.byId.get(entryId) ?? null) : null
  const showReaderOnly = !wide && entryId !== null
  const filterCount = activeFilterCount(filters)

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && query.trim()) {
      // Search the live query, not the deferred list, so a fast Enter opens the right entry.
      const best = searchGlossary(catalog, query).find(({ entry }) => inTab(entry, tab))
      if (!best) return
      event.preventDefault()
      focusHeadwordOf = best.entry.id
      navigate(hrefFor(best.entry.id), { state: { fromIndex: true } })
    } else if (event.key === 'ArrowDown') {
      const first = indexRef.current?.querySelector<HTMLAnchorElement>('[data-first-result]')
      if (first) {
        event.preventDefault()
        first.focus()
      }
    } else if (event.key === 'Escape' && query) {
      event.preventDefault()
      setQuery('')
    }
  }

  const entryActions = (entry: GlossaryEntry) => {
    if (!glossary.canEdit) return null
    return (
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            size={44}
            aria-label={t('glossary.hb.actions', { name: entry.name })}
          >
            <Ellipsis size={20} aria-hidden="true" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {entry.homebrew ? (
            <>
              <Menu.Item
                leftSection={<Pencil size={16} aria-hidden="true" />}
                onClick={() => setEditor({ entry: entry.homebrew!, srdRef: null })}
              >
                {t('glossary.hb.edit')}
              </Menu.Item>
              <Menu.Item
                color="red"
                leftSection={<Trash2 size={16} aria-hidden="true" />}
                onClick={() => setDeleting(entry.homebrew!)}
              >
                {t('glossary.hb.delete')}
              </Menu.Item>
            </>
          ) : (
            <Menu.Item
              leftSection={<ScrollText size={16} aria-hidden="true" />}
              onClick={() => setEditor({ entry: null, srdRef: entry.id })}
            >
              {t('glossary.hb.addHouseRule')}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    )
  }

  const reader = selected ? (
    <EntryArticle
      key={selected.id}
      entry={selected}
      body={glossary.bodies?.[selected.id]}
      houseRules={catalog.houseRules.get(selected.id)}
      headingLevel={showReaderOnly ? 1 : 2}
      headingRef={readerHeading}
      actions={entryActions(selected)}
    />
  ) : entryId ? (
    <p className="gl-quiet-note">{t('glossary.notFound')}</p>
  ) : (
    <Welcome hrefFor={hrefFor} />
  )

  const homebrewEmpty = tab === 'homebrew' && homebrewTotal === 0 && !query

  return (
    <div className="gl-page" data-reader-only={showReaderOnly || undefined}>
      {showReaderOnly ? (
        <Anchor
          component={Link}
          to={indexHref}
          className="gl-back"
          onClick={(event) => {
            // Opened from the index: go back in history so the list keeps its place.
            if ((location.state as { fromIndex?: boolean } | null)?.fromIndex) {
              event.preventDefault()
              navigate(-1)
            }
          }}
        >
          <ChevronLeft size={18} aria-hidden="true" />
          {t('glossary.backToIndex')}
        </Anchor>
      ) : (
        <PageHead
          title={t('module.glossary')}
          description={t('glossary.intro')}
          actions={
            glossary.canEdit && (
              <button
                type="button"
                className="gl-new-entry"
                onClick={() => setEditor({ entry: null, srdRef: null })}
              >
                <Plus size={18} aria-hidden="true" />
                {t('glossary.hb.new')}
              </button>
            )
          }
        />
      )}

      {!showReaderOnly && (
        <div className="gl-finder">
          <div className="gl-search" role="search">
            <TextInput
              ref={searchRef}
              type="search"
              size="lg"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={onSearchKey}
              aria-label={t('glossary.searchLabel')}
              placeholder={t('glossary.searchPlaceholder')}
              leftSection={<Search size={20} aria-hidden="true" />}
              rightSection={
                query ? (
                  <CloseButton
                    size={44}
                    aria-label={t('glossary.clearSearch')}
                    onClick={() => {
                      setQuery('')
                      searchRef.current?.focus()
                    }}
                  />
                ) : (
                  <Kbd className="gl-kbd" title={t('glossary.searchShortcut')}>
                    /
                  </Kbd>
                )
              }
              rightSectionWidth={52}
              classNames={{ input: 'gl-search-input' }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <Tabs
            value={tab}
            onChange={(value) => setParam('cat', value && value !== 'all' ? value : null)}
            className="gl-rail"
            activateTabWithKeyboard
          >
            <Tabs.List aria-label={t('glossary.categories')}>
              {glossaryTabs
                .filter((key) => key !== 'homebrew' || glossary.canEdit || homebrewTotal > 0)
                .map((key) => (
                  <Tabs.Tab key={key} value={key}>
                    {t(`glossary.tab.${key}`)}
                    <span className="gl-count" aria-hidden="true">
                      {counts[key]}
                    </span>
                  </Tabs.Tab>
                ))}
            </Tabs.List>
          </Tabs>
          <div className="gl-status">
            <p aria-live="polite" className="gl-result-count">
              {query.trim() && rows.length === 0
                ? t('glossary.noResults', { query: query.trim() })
                : t('glossary.resultCount', { count: rows.length })}
            </p>
            {tab === 'spell' && (
              <button
                type="button"
                className="gl-filter-toggle"
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal size={16} aria-hidden="true" />
                {filterCount
                  ? t('glossary.filterCount', { count: filterCount })
                  : t('glossary.filters')}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="gl-split">
        {!showReaderOnly && (
          <div className="gl-index-col">
            {homebrewEmpty ? (
              <div className="gl-empty">
                <h2>{t('glossary.hb.emptyTitle')}</h2>
                <p>{glossary.canEdit ? t('glossary.hb.emptyBody') : t('glossary.hb.demo')}</p>
              </div>
            ) : query.trim() && rows.length === 0 ? (
              <div className="gl-empty">
                <p>{t('glossary.noResultsHint')}</p>
              </div>
            ) : (
              <EntryIndex
                ref={indexRef}
                onLeave={() => searchRef.current?.focus()}
                rows={rows}
                grouped={!deferredQuery.trim()}
                query={deferredQuery.trim()}
                selectedId={entryId}
                hrefFor={hrefFor}
                bodies={glossary.bodies}
              />
            )}
          </div>
        )}
        {(wide || showReaderOnly) && (
          <section className="gl-reader" aria-label={selected?.name ?? t('glossary.welcomeTitle')}>
            {reader}
          </section>
        )}
      </div>

      <p className="gl-license">
        {t('glossary.license')} {t('glossary.licenseLegacy')}
      </p>

      <SpellFilterSheet
        opened={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        count={rows.length}
      />
      {glossary.campaignId && (
        <>
          <HomebrewEditor
            target={editor}
            campaignId={glossary.campaignId}
            catalog={catalog}
            returnFocus={editorReturnFocus}
            onClose={() => setEditor(null)}
            onSaved={(saved) => {
              // The saved headword takes focus; the closing drawer must not pull it back.
              setEditorReturnFocus(false)
              setEditor(null)
              // A new house rule opens inside its SRD entry; anything else opens itself.
              const target =
                saved.srd_ref && !editor?.entry ? saved.srd_ref : homebrewEntryId(saved.id)
              focusHeadwordOf = target
              navigate(hrefFor(target))
            }}
          />
          <DeleteDialog
            entry={deleting}
            campaignId={glossary.campaignId}
            onClose={() => setDeleting(null)}
            onDeleted={() => {
              setDeleting(null)
              navigate(indexHref)
            }}
          />
        </>
      )}
    </div>
  )
}

function Welcome({ hrefFor }: { hrefFor: (id: string) => string }) {
  const { t } = useTranslation()
  const glossary = useGlossary()
  const catalog = glossary?.catalog
  if (!catalog) return null
  const recent = (glossary.recent ?? [])
    .map((id) => catalog.byId.get(id))
    .filter(Boolean) as GlossaryEntry[]
  const conditions = conditionsAtTheTable
    .map((id) => catalog.byId.get(id))
    .filter(Boolean) as GlossaryEntry[]
  return (
    <div className="gl-welcome">
      <h2 className="gl-welcome-title">{t('glossary.welcomeTitle')}</h2>
      <p>{t('glossary.welcomeBody')}</p>
      {recent.length > 0 && (
        <section aria-labelledby="gl-recent">
          <h3 id="gl-recent">{t('glossary.recent')}</h3>
          <ul className="gl-word-list">
            {recent.map((entry) => (
              <li key={entry.id}>
                <Link to={hrefFor(entry.id)}>{entry.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="gl-table">
        <h3 id="gl-table">{t('glossary.atTheTable')}</h3>
        <ul className="gl-word-list">
          {conditions.map((entry) => (
            <li key={entry.id}>
              <Link to={hrefFor(entry.id)}>{entry.name}</Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function SpellFilterSheet({
  opened,
  onClose,
  filters,
  onChange,
  count,
}: {
  opened: boolean
  onClose: () => void
  filters: SpellFilters
  onChange: (filters: SpellFilters) => void
  count: number
}) {
  const { t } = useTranslation()
  const wide = !usePhone()
  const levelLabel = (level: number) =>
    level === 0 ? t('glossary.spell.cantripShort') : t('glossary.spell.levelShort', { level })
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position={wide ? 'right' : 'bottom'}
      size={wide ? 400 : 'auto'}
      title={<span className="gl-editor-title">{t('glossary.filters')}</span>}
      closeButtonProps={{ 'aria-label': t('glossary.close'), size: 44 }}
    >
      <Stack gap="lg" pb="md">
        <div>
          <Text component="label" id="gl-level-label" fw={600} size="sm">
            {t('glossary.filter.level')}
          </Text>
          <Text size="sm" c="dimmed" aria-hidden="true">
            {levelLabel(filters.levels[0])} – {levelLabel(filters.levels[1])}
          </Text>
          <RangeSlider
            min={0}
            max={9}
            step={1}
            minRange={0}
            value={filters.levels}
            onChange={(levels) => onChange({ ...filters, levels })}
            label={levelLabel}
            marks={[0, 3, 6, 9].map((value) => ({ value, label: String(value) }))}
            thumbFromLabel={t('glossary.filter.levelFrom')}
            thumbToLabel={t('glossary.filter.levelTo')}
            thumbSize={28}
            mb="lg"
            className="gl-level-slider"
          />
        </div>
        <Select
          label={t('glossary.filter.class')}
          placeholder={t('glossary.filter.any')}
          data={spellClasses.map((c) => ({ value: c, label: t(`srd.class.${c}`) }))}
          value={filters.spellClass}
          onChange={(value) => onChange({ ...filters, spellClass: (value as SpellClass) ?? null })}
          clearable
        />
        <Select
          label={t('glossary.filter.school')}
          placeholder={t('glossary.filter.any')}
          data={spellSchools.map((s) => ({
            value: s,
            label: capitalize(t(`glossary.school.${s}`)),
          }))}
          value={filters.school}
          onChange={(value) => onChange({ ...filters, school: (value as SpellSchool) ?? null })}
          clearable
        />
        <Checkbox
          label={t('glossary.filter.concentration')}
          checked={filters.concentration}
          onChange={(event) => onChange({ ...filters, concentration: event.currentTarget.checked })}
        />
        <Checkbox
          label={t('glossary.filter.ritual')}
          checked={filters.ritual}
          onChange={(event) => onChange({ ...filters, ritual: event.currentTarget.checked })}
        />
        <Group justify="space-between">
          <Button variant="subtle" onClick={() => onChange(noSpellFilters)}>
            {t('glossary.filter.reset')}
          </Button>
          <Button onClick={onClose}>
            {t('glossary.filter.done')} ({count})
          </Button>
        </Group>
      </Stack>
    </Drawer>
  )
}
const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase() + value.slice(1)

function DeleteDialog({
  entry,
  campaignId,
  onClose,
  onDeleted,
}: {
  entry: HomebrewEntry | null
  campaignId: string
  onClose: () => void
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const action = useHomebrewAction(campaignId)
  const error =
    action.error instanceof GlossaryError ? action.error.code : action.error ? 'unknown' : null
  const close = () => {
    action.reset()
    onClose()
  }
  return (
    <Modal
      opened={entry !== null}
      onClose={close}
      centered
      title={<span className="gl-editor-title">{t('glossary.hb.delete')}</span>}
      closeButtonProps={{ 'aria-label': t('glossary.hb.cancel'), size: 44 }}
    >
      {entry && (
        <Stack>
          <Text>{t('glossary.hb.confirmDelete', { name: entry.name })}</Text>
          {error && (
            <Text c="red" role="alert">
              {error === 'unknown' ? t('glossary.hb.deleteError') : t(`glossary.hb.error.${error}`)}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={close}>
              {t('glossary.hb.cancel')}
            </Button>
            <Button
              color="red"
              loading={action.isPending}
              onClick={() =>
                action.mutate(
                  { kind: 'delete', entryId: entry.id, revision: entry.revision },
                  {
                    onSuccess: () => {
                      action.reset()
                      notifications.show({
                        message: t('glossary.hb.deleted'),
                        position: 'bottom-center',
                      })
                      onDeleted()
                    },
                  },
                )
              }
            >
              {t('glossary.hb.delete')}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
