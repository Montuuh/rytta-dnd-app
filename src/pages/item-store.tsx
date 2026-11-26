import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Menu,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { Drawer } from '@/shared/ui/overlays'
import { usePhone } from '@/shared/ui/use-viewport'
import { FilterLine, StatusRail } from '@/shared/ui/rail-line'
import { Windowed } from '@/shared/ui/windowed'
import { useQuery } from '@tanstack/react-query'
import {
  BookmarkCheck,
  ChevronRight,
  Ellipsis,
  Gift,
  GitMerge,
  Inbox,
  PackagePlus,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import {
  BasicImport,
  catalogueQuery,
  DefinitionEditor,
  DeleteItemDialog,
  ItemIcon,
  ItemSheet,
  itemCategories,
  MergeItems,
  LootDrawer,
  PackFinds,
  ProposalReview,
  rarities,
  rarityPips,
  rosterQuery,
  StoreFilters,
  useItemTemplate,
  useItemText,
  usePendingProposalCount,
  type GiveOutcome,
  type ItemCategory,
  type ItemDefinition,
  type StoreSort,
  type StoreView,
} from '@/features/inventory'
import { CatalogueShopPicker } from '@/features/shops'
import { newRequestId } from '@/shared/lib/request-id'
import { rankSearch } from '@/shared/lib/search-rank'
import { localizedName } from '@/shared/lib/translations'
import './item-store.css'

const viewKey = 'rytta-store-view'
function savedView(): StoreView {
  try {
    return localStorage.getItem(viewKey) === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

/** Rows mounted together; chunks far from the screen are replaced by a spacer (RYT-117). */
const chunkSize = 24
const rowEstimate = 62

/** RYT-027 item storeroom: a filterable list (or compact grid) of campaign items inside the DM
 * Command Center. A row opens the item sheet; giving, editing and the rest start there.
 * `?create=<characterId>` opens "new item for". */
export function ItemStore({ campaignId }: { campaignId: string }) {
  const { state } = useAuth()
  const { t, i18n } = useTranslation()
  const text = useItemText()
  const [params, setParams] = useSearchParams()
  const query = useQuery(catalogueQuery(state.user!.id, campaignId))
  const roster = useQuery(rosterQuery(state.user!.id, campaignId))
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<ItemCategory | 'all'>('all')
  const [sort, setSort] = useState<StoreSort>('name')
  const [view, setViewState] = useState<StoreView>(savedView)
  const [filtering, setFiltering] = useState(false)
  const [editor, setEditor] = useState<{ item: ItemDefinition | null; give?: string[] } | null>(
    null,
  )
  const [sheetId, setSheetId] = useState<string | null>(null)
  const [give, setGive] = useState<ItemDefinition | true | null>(null)
  const [managing, setManaging] = useState(false)
  const [mergeSource, setMergeSource] = useState<string | null>(null)
  const [shop, setShop] = useState<ItemDefinition | null>(null)
  const [removing, setRemoving] = useState<ItemDefinition | null>(null)
  // RYT-104/105: basic catalogue import, proposal review and duplicate merges.
  const [importing, setImporting] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  // RYT-184: the group "In your packs" under the list, read only while the search has 2+ characters.
  const [packsShown, setPackShown] = useState(false)
  const [merging, setMerging] = useState<ItemDefinition | null>(null)
  const pendingProposals = usePendingProposalCount(campaignId, true)
  const template = useItemTemplate(campaignId)
  const templateRequests = useRef(new Map<string, string>())
  const nameOf = text.nameOf
  // Every message gets a serial, so the same sentence said twice is announced and shown again.
  const [notice, setNoticeState] = useState<{
    text: string
    tone: 'ok' | 'warn'
    serial: number
  } | null>(null)
  const noticeSerial = useRef(0)
  const setNotice = (next: { text: string; tone: 'ok' | 'warn' } | null) =>
    setNoticeState(next && { ...next, serial: ++noticeSerial.current })
  const phone = usePhone()
  // Overlays opened from a menu would otherwise "restore" focus to a menu item that no longer
  // exists. Remember the visible trigger and return focus there (RYT-027 F1).
  const trigger = useRef<HTMLElement | null>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const returnFocus = () =>
    requestAnimationFrame(() =>
      (trigger.current?.isConnected ? trigger.current : menuButton.current)?.focus(),
    )
  const remember = (target: HTMLElement | null) => {
    trigger.current = target
  }
  // Run the chosen menu action only after the menu has closed and returned focus to its ⋯
  // button, so the overlay that opens next remembers a real element (RYT-027 review F1).
  const pendingAction = useRef<(() => void) | null>(null)
  const choose = (run: () => void) => () => {
    pendingAction.current = run
  }
  // `?create=<characterId>` opens "new item for" on load and whenever the link changes while the
  // storeroom is already mounted (RYT-027 R2-2). Closing the editor removes the parameter.
  const createFor = params.get('create')
  const [seenCreate, setSeenCreate] = useState<string | null>(null)
  if (createFor !== seenCreate) {
    setSeenCreate(createFor)
    if (createFor) setEditor({ item: null, give: [createFor] })
  }
  // RYT-179: `?do=new` and `?do=loot` (from the quick switcher) act once and leave the URL, so a
  // reload or Back never repeats them. Loot waits for the catalogue, which its button needs.
  const action = params.get('do')
  const due = action === 'new' || (action === 'loot' && !query.isPending) ? action : null
  const [seenAction, setSeenAction] = useState<string | null>(null)
  if (due !== seenAction) {
    setSeenAction(due)
    if (due === 'new') setEditor({ item: null })
    else if (due === 'loot' && (query.data ?? []).some((item) => !item.archived)) setGive(true)
  }
  useEffect(() => {
    if (!due) return
    trigger.current = null
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('do')
        return next
      },
      { replace: true },
    )
  }, [due, setParams])
  // "/" jumps to the item search from anywhere on the screen, as in the glossary and the bestiary.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.defaultPrevented || event.isComposing || event.repeat) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (document.querySelector('[role="dialog"]')) return
      event.preventDefault()
      searchInput.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  const setView = (next: StoreView) => {
    setViewState(next)
    try {
      localStorage.setItem(viewKey, next)
    } catch {
      /* The choice still applies in memory. */
    }
  }
  const all = useMemo(() => (query.data ?? []).filter((item) => !item.archived), [query.data])
  const toggleTemplate = (item: ItemDefinition) => {
    const next = !item.is_template
    const key = `${item.id}:${item.revision}:${next}`
    if (!templateRequests.current.has(key)) templateRequests.current.set(key, newRequestId())
    template.mutate(
      {
        definitionId: item.id,
        template: next,
        revision: item.revision,
        requestId: templateRequests.current.get(key)!,
      },
      {
        onSuccess: () =>
          setNotice({
            tone: 'ok',
            text: t(next ? 'items.template.on' : 'items.template.off', { name: nameOf(item) }),
          }),
        onError: (error) =>
          setNotice({
            tone: 'warn',
            text: t(error.message === 'stale' ? 'inventory.error.stale' : 'items.template.error'),
          }),
      },
    )
  }
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of all) map.set(item.category, (map.get(item.category) ?? 0) + 1)
    return map
  }, [all])
  const items = useMemo(() => {
    const byName = (a: ItemDefinition, b: ItemDefinition) =>
      localizedName(a, i18n.language).localeCompare(localizedName(b, i18n.language), i18n.language)
    const sorted = all
      .filter((item) => category === 'all' || item.category === category)
      .sort((a, b) => {
        if (sort === 'category')
          return (
            itemCategories.indexOf(a.category) - itemCategories.indexOf(b.category) || byName(a, b)
          )
        if (sort === 'rarity')
          return rarities.indexOf(b.rarity) - rarities.indexOf(a.rarity) || byName(a, b)
        if (sort === 'value') return (b.value_gp ?? -1) - (a.value_gp ?? -1) || byName(a, b)
        return byName(a, b)
      })
    // Names that start with the search first, then names with a word that starts with it.
    return rankSearch(sorted, search, (item) => [item.name, localizedName(item, i18n.language)])
  }, [all, category, search, sort, i18n.language])
  const chunks = useMemo(() => {
    const out: ItemDefinition[][] = []
    for (let at = 0; at < items.length; at += chunkSize) out.push(items.slice(at, at + chunkSize))
    return out
  }, [items])
  const packSearch = search.trim().length >= 2 && Boolean(query.data)
  const sheetItem = sheetId ? (all.find((item) => item.id === sheetId) ?? null) : null
  const closeEditor = () => {
    setEditor(null)
    // A `?create=` link has no visible opener; fall back to the menu button.
    if (params.has('create')) trigger.current = null
    returnFocus()
    if (params.has('create'))
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete('create')
          return next
        },
        { replace: true },
      )
  }
  const saved = (item: ItemDefinition, outcome?: GiveOutcome, repriced?: number) => {
    closeEditor()
    if (repriced)
      setNotice({
        tone: 'ok',
        text: t('lifecycle.syncDone', { name: nameOf(item), count: repriced }),
      })
    else if (outcome?.failed.length)
      setNotice({
        tone: 'warn',
        text: t('store.givePartial', { name: nameOf(item), names: outcome.failed.join(', ') }),
      })
    else if (outcome?.given.length)
      setNotice({
        tone: 'ok',
        text: t('store.createdFor', { name: nameOf(item), names: outcome.given.join(', ') }),
      })
    else setNotice({ tone: 'ok', text: t('catalogue.savedName', { name: nameOf(item) }) })
  }
  const filterParts = [
    category === 'all' ? null : t(`inventory.category.${category}`),
    sort === 'name' ? null : t(`store.by.${sort}`),
  ].filter(Boolean)
  const filtersActive = category !== 'all' || search.trim().length > 0
  // The Filters sheet's own choices in force: the category and the order (the view is a preference).
  const filterCount = (category === 'all' ? 0 : 1) + (sort === 'name' ? 0 : 1)
  const openItem = (item: ItemDefinition, from: HTMLElement | null) => {
    remember(from)
    setSheetId(item.id)
  }
  const countText =
    items.length === all.length
      ? t('store.count', { count: all.length })
      : t('store.countOf', { shown: items.length, count: all.length })

  return (
    <section aria-labelledby="store-heading" className="item-store">
      <Title order={2} id="store-heading" className="store-title">
        {t('catalogue.title')}
      </Title>
      <div className="store-sticky">
        <div className="store-find">
          <TextInput
            className="store-search"
            ref={searchInput}
            type="search"
            enterKeyHint="go"
            aria-label={t('catalogue.search')}
            placeholder={t('store.searchPlaceholder')}
            rightSectionWidth={48}
            leftSection={<Search size={16} aria-hidden="true" />}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            onKeyDown={(event) => {
              // Enter opens the best match.
              if (event.key !== 'Enter' || event.nativeEvent.isComposing || !items[0]) return
              event.preventDefault()
              openItem(items[0], searchInput.current)
            }}
            rightSection={
              search ? (
                <ActionIcon
                  variant="subtle"
                  size={44}
                  aria-label={t('store.clearSearch')}
                  onClick={() => {
                    setSearch('')
                    searchInput.current?.focus()
                  }}
                >
                  <X size={16} aria-hidden="true" />
                </ActionIcon>
              ) : null
            }
          />
          <div className="store-tools">
            {all.length > 0 && (
              <Button
                variant="default"
                className="store-filters-button"
                data-active={filterCount > 0 || undefined}
                leftSection={<SlidersHorizontal size={18} aria-hidden="true" />}
                onClick={(event) => {
                  remember(event.currentTarget)
                  setFiltering(true)
                }}
              >
                {t('store.filters')}
                {filterCount > 0 && (
                  <>
                    <span className="store-filters-count tabular" aria-hidden="true">
                      {filterCount}
                    </span>
                    <span className="visually-hidden">
                      {t('store.filtersActive', { count: filterCount })}
                    </span>
                  </>
                )}
              </Button>
            )}
            <Menu
              position="bottom-end"
              withinPortal
              withInitialFocusPlaceholder={false}
              onExitTransitionEnd={() => {
                const run = pendingAction.current
                pendingAction.current = null
                run?.()
              }}
            >
              <Menu.Target>
                <ActionIcon
                  ref={menuButton}
                  variant="default"
                  size={44}
                  onClick={() => remember(menuButton.current)}
                  aria-label={t('store.menu')}
                  title={t('common.moreActions')}
                >
                  <Ellipsis size={20} aria-hidden="true" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<Plus size={18} aria-hidden="true" />}
                  onClick={choose(() => setEditor({ item: null }))}
                >
                  {t('catalogue.create')}
                </Menu.Item>
                <Menu.Item
                  leftSection={<PackagePlus size={18} aria-hidden="true" />}
                  onClick={choose(() => {
                    setMergeSource(null)
                    setManaging(true)
                  })}
                >
                  {t('loot.manage')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </div>
        </div>
        {filterParts.length > 0 && (
          <FilterLine
            className="store-filter-line"
            text={filterParts.join(' · ')}
            clearLabel={t('store.clearActive')}
            clearName={t('store.clearActiveFilters')}
            onClear={() => {
              setCategory('all')
              setSort('name')
            }}
          />
        )}
        <StatusRail
          className="store-status"
          text={notice?.text ?? null}
          serial={notice?.serial}
          tone={notice?.tone}
        >
          <ActionIcon
            variant="subtle"
            size={44}
            aria-label={t('common.close')}
            onClick={() => setNotice(null)}
          >
            <X size={16} aria-hidden="true" />
          </ActionIcon>
        </StatusRail>
      </div>
      {all.length > 0 && (
        <Button
          fullWidth
          size="md"
          className="store-loot"
          leftSection={<Gift size={18} aria-hidden="true" />}
          onClick={(event) => {
            remember(event.currentTarget)
            setGive(true)
          }}
        >
          {t('loot.open')}
        </Button>
      )}
      {pendingProposals > 0 && (
        <UnstyledButton
          className="store-proposals"
          onClick={(event) => {
            remember(event.currentTarget)
            setReviewing(true)
          }}
        >
          <Inbox size={18} aria-hidden="true" />
          <span>{t('store.proposals', { count: pendingProposals })}</span>
          <ChevronRight size={18} aria-hidden="true" />
        </UnstyledButton>
      )}
      {query.isPending && (
        <Text role="status" mt="md">
          {t('common.loading')}
        </Text>
      )}
      {query.isError && (
        <Alert color="red" role="alert" mt="md">
          {t('query.error')}{' '}
          <Button variant="subtle" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </Alert>
      )}
      {query.data && all.length > 0 && <p className="store-count">{countText}</p>}
      {query.data && items.length === 0 && !(packSearch && packsShown) && (
        <Stack align="center" gap="xs" py="xl" className="store-empty">
          <ItemIcon icon="package" size={36} />
          <Text>
            {t(
              all.length
                ? category === 'all'
                  ? 'store.noMatch'
                  : 'store.noResults'
                : 'items.import.empty',
            )}
          </Text>
          {all.length === 0 && (
            <Group justify="center" gap="xs">
              <Button
                variant="light"
                onClick={(event) => {
                  remember(event.currentTarget)
                  setImporting(true)
                }}
              >
                {t('items.import.open')}
              </Button>
              <Button
                variant="outline"
                leftSection={<Plus size={18} aria-hidden="true" />}
                onClick={(event) => {
                  remember(event.currentTarget)
                  setEditor({ item: null })
                }}
              >
                {t('catalogue.create')}
              </Button>
            </Group>
          )}
          {filtersActive && (
            <Button
              variant="subtle"
              onClick={() => {
                setSearch('')
                setCategory('all')
              }}
            >
              {t('store.clearFilters')}
            </Button>
          )}
        </Stack>
      )}

      {items.length > 0 && view === 'list' && (
        <div className="store-lists">
          {chunks.map((chunk, index) => (
            <Windowed
              key={chunk[0]!.id}
              estimate={chunk.length * rowEstimate}
              initiallyMounted={index < 2}
            >
              <ul className="store-list" aria-label={t('catalogue.title')}>
                {chunk.map((item) => (
                  <li key={item.id} className="store-row">
                    <UnstyledButton
                      className="store-row-main"
                      aria-haspopup="dialog"
                      onClick={(event) => openItem(item, event.currentTarget)}
                    >
                      <span className={`store-glyph rarity-${item.rarity}`} aria-hidden="true">
                        <ItemIcon icon={item.icon} imagePath={item.image_path} size={22} />
                      </span>
                      <span className="store-row-body">
                        <span className="store-row-name user-copy">
                          {nameOf(item)}
                          {item.is_template && (
                            <span className="store-template-mark" title={t('items.template.mark')}>
                              <BookmarkCheck size={14} aria-hidden="true" />
                              <span className="visually-hidden"> · {t('items.template.mark')}</span>
                            </span>
                          )}
                        </span>
                        <span className="store-row-meta">
                          <span className="store-meta-part">
                            {t(`inventory.category.${item.category}`)}
                          </span>
                          <span className="store-meta-part">
                            {t(`inventory.rarity.${item.rarity}`)}
                          </span>
                          {text.weight(item) && (
                            <span className="store-meta-part">{text.weight(item)}</span>
                          )}
                        </span>
                      </span>
                      <span
                        className="store-value"
                        data-empty={item.value_gp === null || undefined}
                      >
                        {text.price(item)}
                      </span>
                    </UnstyledButton>
                  </li>
                ))}
              </ul>
            </Windowed>
          ))}
        </div>
      )}
      {items.length > 0 && view === 'grid' && (
        <div className="store-grids">
          {chunks.map((chunk, index) => (
            <Windowed
              key={chunk[0]!.id}
              estimate={Math.ceil(chunk.length / 3) * 140}
              initiallyMounted={index < 2}
            >
              <ul className="store-grid" aria-label={t('catalogue.title')}>
                {chunk.map((item) => (
                  <li key={item.id} className={`store-tile rarity-${item.rarity}`}>
                    <UnstyledButton
                      className="store-tile-main"
                      aria-haspopup="dialog"
                      onClick={(event) => openItem(item, event.currentTarget)}
                    >
                      <span className="store-tile-icon" aria-hidden="true">
                        <ItemIcon icon={item.icon} imagePath={item.image_path} size={30} />
                      </span>
                      <span className="store-tile-name user-copy">
                        {nameOf(item)}
                        {item.is_template && (
                          <span className="visually-hidden"> · {t('items.template.mark')}</span>
                        )}
                      </span>
                      <span
                        className="store-tile-meta"
                        data-empty={item.value_gp === null || undefined}
                      >
                        {text.price(item)}
                      </span>
                      <span className="item-rarity-pips" aria-hidden="true">
                        {'◆'.repeat(rarityPips[item.rarity])}
                      </span>
                    </UnstyledButton>
                  </li>
                ))}
              </ul>
            </Windowed>
          ))}
        </div>
      )}
      {packSearch && query.data && (
        <PackFinds
          campaignId={campaignId}
          search={search}
          definitions={query.data}
          category={category}
          storeroomEmpty={items.length === 0}
          fallbackFocus={searchInput}
          onShown={setPackShown}
          onAdded={(message) => setNotice({ tone: 'ok', text: message })}
        />
      )}

      {filtering && (
        <StoreFilters
          counts={counts}
          total={all.length}
          category={category}
          sort={sort}
          view={view}
          shown={items.length}
          onCategory={setCategory}
          onSort={setSort}
          onView={setView}
          onClose={() => {
            setFiltering(false)
            returnFocus()
          }}
        />
      )}
      {sheetItem && (
        <ItemSheet
          campaignId={campaignId}
          item={sheetItem}
          onClose={() => {
            setSheetId(null)
            returnFocus()
          }}
          onEdit={() => {
            setSheetId(null)
            setEditor({ item: sheetItem })
          }}
          onShop={() => {
            setSheetId(null)
            setShop(sheetItem)
          }}
          onMerge={() => {
            setSheetId(null)
            setMerging(sheetItem)
          }}
          onDelete={() => {
            setSheetId(null)
            setRemoving(sheetItem)
          }}
          onTemplate={() => {
            setSheetId(null)
            toggleTemplate(sheetItem)
            returnFocus()
          }}
          onShare={() => {
            setSheetId(null)
            setGive(sheetItem)
          }}
          onGiven={(character, quantity) => {
            setSheetId(null)
            setNotice({
              tone: 'ok',
              text:
                quantity > 1
                  ? t('store.givenMany', { name: nameOf(sheetItem), character, count: quantity })
                  : t('store.givenOne', { name: nameOf(sheetItem), character }),
            })
            returnFocus()
          }}
        />
      )}
      {editor && (
        <DefinitionEditor
          campaignId={campaignId}
          definition={editor.item}
          allowGive
          title={
            editor.give?.length
              ? t('store.createFor', {
                  name: editor.give
                    .map((id) => roster.data?.find((c) => c.id === id)?.name)
                    .filter(Boolean)
                    .join(', '),
                })
              : undefined
          }
          initialGive={editor.give?.filter((id) => roster.data?.some((c) => c.id === id) ?? true)}
          // The storeroom returns focus itself: to the visible trigger, or to the menu button
          // after a `?create=` link, whatever had focus before the link (RYT-027 R3-2).
          returnFocusToOpener={false}
          onClose={closeEditor}
          onSaved={saved}
        />
      )}
      {give && (
        <LootDrawer
          campaignId={campaignId}
          items={all}
          initial={give === true ? undefined : give}
          onDelivered={(delivered) => setNotice({ tone: 'ok', text: delivered })}
          onClose={() => {
            setGive(null)
            returnFocus()
          }}
        />
      )}
      {managing && (
        <Drawer
          opened
          title={t('loot.manage')}
          position={phone ? 'bottom' : 'right'}
          size={phone ? 'auto' : 420}
          onClose={() => {
            setManaging(false)
            returnFocus()
          }}
          returnFocus={false}
          closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
        >
          <Stack>
            <Button
              variant="light"
              leftSection={<PackagePlus size={18} />}
              onClick={() => {
                setManaging(false)
                setImporting(true)
              }}
            >
              {t('items.import.open')}
            </Button>
            {all.length > 1 && (
              <>
                <Select
                  label={t('loot.mergeSource')}
                  searchable
                  value={mergeSource}
                  onChange={setMergeSource}
                  data={all.map((item) => ({ value: item.id, label: nameOf(item) }))}
                  limit={40}
                  comboboxProps={{ withinPortal: false }}
                />
                <Button
                  variant="default"
                  leftSection={<GitMerge size={18} />}
                  disabled={!mergeSource}
                  onClick={() => {
                    const source = all.find((item) => item.id === mergeSource)
                    if (source) {
                      setManaging(false)
                      setMerging(source)
                    }
                  }}
                >
                  {t('items.merge.open')}
                </Button>
              </>
            )}
          </Stack>
        </Drawer>
      )}
      {removing && (
        <DeleteItemDialog
          campaignId={campaignId}
          item={removing}
          onClose={() => {
            setRemoving(null)
            returnFocus()
          }}
          onDeleted={(item) => {
            setRemoving(null)
            // The row is gone: land on the menu button rather than a detached trigger.
            trigger.current = null
            setNotice({ tone: 'ok', text: t('lifecycle.deleted', { name: nameOf(item) }) })
            returnFocus()
          }}
        />
      )}
      {importing && (
        <BasicImport
          campaignId={campaignId}
          definitions={query.data ?? []}
          onClose={() => {
            setImporting(false)
            returnFocus()
          }}
          onDone={(done) => {
            setImporting(false)
            setNotice({ tone: 'ok', text: done })
            returnFocus()
          }}
        />
      )}
      {reviewing && (
        <ProposalReview
          campaignId={campaignId}
          items={all}
          onClose={() => {
            setReviewing(false)
            returnFocus()
          }}
          onNotice={(done) => setNotice({ tone: 'ok', text: done })}
        />
      )}
      {merging && (
        <MergeItems
          campaignId={campaignId}
          source={merging}
          items={all}
          onClose={() => {
            setMerging(null)
            returnFocus()
          }}
          onDone={(done) => {
            setMerging(null)
            // The duplicate's row is gone: land on the menu button.
            trigger.current = null
            setNotice({ tone: 'ok', text: done })
            returnFocus()
          }}
        />
      )}
      {shop && (
        <CatalogueShopPicker
          campaignId={campaignId}
          item={shop}
          onClose={() => {
            setShop(null)
            returnFocus()
          }}
        />
      )}
    </section>
  )
}
