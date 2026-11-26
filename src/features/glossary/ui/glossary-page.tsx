import { config } from '@/shared/lib/config'
import {
  Anchor,
  Button,
  Checkbox,
  CloseButton,
  Group,
  Kbd,
  Loader,
  RangeSlider,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { Drawer } from '@/shared/ui/overlays'
import { StaleLine } from '@/features/campaigns'
import { PageHead } from '@/shared/ui/page-head'
import { usePhone, useWide } from '@/shared/ui/use-viewport'
import { ChevronLeft, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/kit/empty'
import { useBasePackLabel } from '@/shared/ui/pack-origins-context'
import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import type { GlossaryEntry } from '../domain/catalog'
import { searchGlossary } from '../domain/search'
import {
  featureClasses,
  spellClasses,
  spellSchools,
  type FeatureClass,
  type SpellClass,
  type SpellSchool,
} from '../domain/types'
import { EntryArticle } from './entry-article'
import { centreUntilSettled } from '@/shared/ui/centre-until-settled'
import { EntryIndex, type IndexRowData } from './entry-index'
import { useGlossary } from './glossary-context'
import { headwordFocus } from './headword-focus'
import { packNameOf } from './pack-mark'
import {
  activeFilterCount,
  matchesSpellFilters,
  noSpellFilters,
  type SpellFilters,
} from './spell-filters'
import { glossaryTabs, inTab, isGlossaryTab, type GlossaryTab } from './tabs'
import { routeOf } from '@/shared/lib/app-path'

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

/**
 * The address bar's current query. React Router's functional `setSearchParams` updater gets the
 * params of the render it came from, so a delayed write (the search mirror) would drop a
 * category chosen meanwhile; reading the live URL keeps both (`?q=` and `?cat=`).
 */
function liveSearchParams() {
  return new URLSearchParams(window.location.search)
}

/** The entry last read on its own (phone) route; the index returns focus to its row. */
let lastReaderEntry: string | null = null

/** RYT-008 glossary: search, categories, alphabetical index and a reader for one entry. */
export function GlossaryPage() {
  const { t, i18n } = useTranslation()
  const glossary = useGlossary()
  const baseLabel = useBasePackLabel('SRD')
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
  const [featureClass, setFeatureClass] = useState<FeatureClass | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // The field owns what is typed; the URL only mirrors it for deep links. Driving the input
  // from the URL dropped keystrokes while the 550-row list re-rendered (UI review F1).
  const urlQuery = params.get('q') ?? ''
  const [query, setQuery] = useState(urlQuery)
  // What this page last wrote to ?q= and what it last saw there: a ?q= change it did not
  // write (the nav item, a link) replaces the typed text (UI review R2-2).
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
      const currentPath = routeOf(
        window.location.href,
        window.location.origin,
        import.meta.env.BASE_URL,
      )?.split('?')[0]
      if (currentPath !== scheduledPath) return
      setWrittenQuery(value)
      const next = liveSearchParams()
      if (value) next.set('q', value)
      else next.delete('q')
      setParams(next, { replace: true })
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
  // Opening on the search: a keyboard or mouse reader types at once; touch keeps the keyboard down.
  const hasCatalog = catalog !== null
  const landedFocus = useRef(false)
  useEffect(() => {
    if (landedFocus.current || !hasCatalog) return
    landedFocus.current = true
    if (entryId || urlQuery || params.get('cat')) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    searchRef.current?.focus({ preventScroll: true })
    // Opens once per visit: the live URL and entry at that moment decide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCatalog])
  useEffect(() => {
    if (entryId && catalog?.byId.has(entryId)) remember?.(entryId)
  }, [entryId, catalog, remember])
  // The entry whose headword already took focus on its own route (phones).
  const focusedEntry = useRef<string | null>(null)
  useEffect(() => {
    // A new entry on its own (phone) route, or one opened with Enter or just saved, moves focus
    // to its headword. The next frame runs after the layout's own route-change focus. A data
    // refresh of the same entry (the homebrew refetch, a failed save) never moves focus again:
    // it would pull the cursor out of an open editor.
    if (!entryId) {
      focusedEntry.current = null
      return
    }
    const requested = headwordFocus.id === entryId
    if (!requested && (wide || focusedEntry.current === entryId)) return
    const frame = requestAnimationFrame(() => {
      if (!readerHeading.current) return
      readerHeading.current.focus()
      focusedEntry.current = entryId
      if (requested) headwordFocus.id = null
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
    // layout's route-change scroll and focus, hence the next frame). The list can still swap
    // between ranked and lettered while the search settles, which drops the row it just focused:
    // for a moment the row is focused again whenever focus has fallen back to the page.
    if (!lastReaderEntry || !catalog) return
    const id = lastReaderEntry
    const started = performance.now()
    let frame = 0
    let centred = false
    const tick = () => {
      const row = indexRef.current?.querySelector<HTMLAnchorElement>(
        `[data-entry-id="${CSS.escape(id)}"]`,
      )
      const dropped = !document.activeElement || document.activeElement === document.body
      if (row && (!centred || dropped)) {
        if (!centred) centreUntilSettled(row)
        centred = true
        row.focus({ preventScroll: true })
      }
      if (performance.now() - started < 600) frame = requestAnimationFrame(tick)
      else lastReaderEntry = null
    }
    frame = requestAnimationFrame(tick)
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
          inTab(entry, tab) &&
          (tab !== 'spell' || matchesSpellFilters(entry, filters)) &&
          (tab !== 'feature' || !featureClass || entry.feature?.classKey === featureClass),
      ),
    [matches, tab, filters, featureClass],
  )
  // Tab counts follow the current search, so a tab shows how many matches it holds.
  const counts = useMemo(() => {
    const out: Record<GlossaryTab, number> = {
      all: 0,
      condition: 0,
      action: 0,
      rule: 0,
      spell: 0,
      feature: 0,
      homebrew: 0,
    }
    for (const { entry } of matches)
      for (const key of glossaryTabs) if (inTab(entry, key)) out[key]++
    return out
  }, [matches])
  const language = i18n.resolvedLanguage === 'en' ? 'en' : 'es'
  const packCount = glossary?.packs.length ?? 0
  const packOf = useMemo(() => {
    const packs = glossary?.packs ?? []
    return packCount > 1
      ? (entry: GlossaryEntry) => packNameOf(entry, packs, language, baseLabel)
      : undefined
  }, [glossary?.packs, packCount, language, baseLabel])
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
  if (isGlossaryTab(params.get('cat'))) keepParams.set('cat', tab)
  const keep = keepParams.toString()
  const hrefFor = (id: string) => `${pagePath}/${encodeURIComponent(id)}${keep ? `?${keep}` : ''}`
  // "All entries" from a reader opens the list, not the landing.
  const indexParams = new URLSearchParams(keepParams)
  if (!indexParams.has('cat')) indexParams.set('cat', 'all')
  const indexHref = `${pagePath}?${indexParams.toString()}`

  const setParam = (key: string, value: string | null) => {
    const next = liveSearchParams()
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  // RYT-167: the SRD lives in the library; the offline preview build has none to read.
  if (config.VITE_DATA_MODE !== 'supabase')
    return (
      <Stack className="gl-page">
        <Title order={1}>{t('module.glossary')}</Title>
        <p className="gl-quiet-note">{t('glossary.noLibrary')}</p>
      </Stack>
    )
  // RYT-161: a failed refresh keeps the glossary already on screen.
  if (glossary.indexError && !catalog)
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
      headwordFocus.id = best.entry.id
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

  // Nothing asked yet: the search is the way in, not a list of every entry.
  const landing = !entryId && !query.trim() && !isGlossaryTab(params.get('cat'))

  const reader = selected ? (
    <EntryArticle
      key={selected.id}
      entry={selected}
      body={glossary.bodies?.[selected.id]}
      houseRules={catalog.houseRules.get(selected.id)}
      headingLevel={showReaderOnly ? 1 : 2}
      headingRef={readerHeading}
    />
  ) : entryId ? (
    <p className="gl-quiet-note">{t('glossary.notFound')}</p>
  ) : (
    <Welcome hrefFor={hrefFor} showRecent={!landing} />
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
          actions={
            glossary.canEdit && (
              <button
                type="button"
                className="gl-new-entry"
                onClick={() => glossary.manage?.create(null)}
              >
                <Plus size={18} aria-hidden="true" />
                {t('glossary.hb.new')}
              </button>
            )
          }
        />
      )}
      <StaleLine
        queries={[
          {
            data: catalog,
            isError: Boolean(glossary.loadError),
            error: glossary.loadError,
            refetch: async () => glossary.retry(),
          },
        ]}
      />
      <StaleLine
        missing
        text={t('glossary.homebrewMissing')}
        queries={[
          {
            data: undefined,
            isError: Boolean(glossary.homebrewError),
            error: glossary.homebrewError,
            refetch: async () => glossary.retry(),
          },
        ]}
      />

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
            value={landing ? null : tab}
            onChange={(value) => setParam('cat', value)}
            className="gl-rail"
            activateTabWithKeyboard
          >
            <Tabs.List aria-label={t('glossary.categories')}>
              {glossaryTabs
                .filter((key) => key === 'all' || key === tab || counts[key] > 0)
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
          {!landing && (
            <div className="gl-status">
              <p aria-live="polite" className="gl-result-count">
                {query.trim() && rows.length === 0
                  ? t('glossary.noResults', { query: query.trim() })
                  : t('glossary.resultCount', { count: rows.length })}
              </p>
              {tab === 'feature' && (
                <Select
                  aria-label={t('glossary.filter.class')}
                  className="gl-feature-class"
                  data={[
                    { value: '', label: t('glossary.feature.allClasses') },
                    ...featureClasses.map((c) => ({ value: c, label: t(`srd.class.${c}`) })),
                  ]}
                  value={featureClass ?? ''}
                  onChange={(value) => setFeatureClass((value || null) as FeatureClass | null)}
                  allowDeselect={false}
                  comboboxProps={{ withinPortal: true }}
                />
              )}
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
          )}
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
            ) : landing ? (
              <Landing hrefFor={hrefFor} />
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
                revealId={wide ? null : lastReaderEntry}
                hrefFor={hrefFor}
                bodies={glossary.bodies}
                packOf={packOf}
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
    </div>
  )
}

/** The index column before anything is asked: the entries read lately, or a prompt to search. */
function Landing({ hrefFor }: { hrefFor: (id: string) => string }) {
  const { t } = useTranslation()
  const glossary = useGlossary()
  const catalog = glossary?.catalog
  if (!catalog) return null
  const recent = (glossary.recent ?? [])
    .map((id) => catalog.byId.get(id))
    .filter((entry): entry is GlossaryEntry => Boolean(entry) && !catalog.unlisted.includes(entry!))
  if (recent.length > 0)
    return (
      <section className="gl-landing" aria-labelledby="gl-recent-landing">
        <h2 id="gl-recent-landing">{t('glossary.recent')}</h2>
        <ul className="gl-word-list">
          {recent.map((entry) => (
            <li key={entry.id}>
              <Link to={hrefFor(entry.id)} state={{ fromIndex: true }}>
                {entry.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    )
  return (
    <Empty className="tw:items-start tw:justify-start tw:rounded-none tw:border-0 tw:px-2 tw:py-6 tw:text-left">
      <EmptyHeader className="tw:items-start">
        <EmptyMedia className="tw:mb-0 tw:text-(--app-accent)">
          <Search size={24} aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle role="heading" aria-level={2} className="gl-landing-title tw:text-(--app-text)">
          {t('glossary.landingTitle')}
        </EmptyTitle>
        <EmptyDescription className="tw:text-(--app-muted)">
          {t('glossary.landingHint')}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function Welcome({
  hrefFor,
  showRecent,
}: {
  hrefFor: (id: string) => string
  showRecent: boolean
}) {
  const { t } = useTranslation()
  const glossary = useGlossary()
  const catalog = glossary?.catalog
  if (!catalog) return null
  const recent = (glossary.recent ?? [])
    .map((id) => catalog.byId.get(id))
    .filter((entry): entry is GlossaryEntry => Boolean(entry) && !catalog.unlisted.includes(entry!))
  // An entry the campaign no longer offers stays readable, but is not suggested.
  const conditions = conditionsAtTheTable
    .map((id) => catalog.byId.get(id))
    .filter((entry): entry is GlossaryEntry => Boolean(entry) && !catalog.unlisted.includes(entry!))
  return (
    <div className="gl-welcome">
      <h2 className="gl-welcome-title">{t('glossary.welcomeTitle')}</h2>
      {showRecent && recent.length > 0 && (
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
