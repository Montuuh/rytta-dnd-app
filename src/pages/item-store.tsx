import { useMemo, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Select,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core'
import { Drawer } from '@/shared/ui/overlays'
import { usePhone } from '@/shared/ui/use-viewport'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpDown,
  Bookmark,
  BookmarkCheck,
  Ellipsis,
  Gift,
  GitMerge,
  Inbox,
  LayoutGrid,
  List,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Store,
  Trash2,
  X,
} from 'lucide-react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import {
  BasicImport,
  catalogueQuery,
  categoryIcons,
  DefinitionEditor,
  DeleteItemDialog,
  ItemIcon,
  itemCategories,
  MergeItems,
  LootDrawer,
  ProposalReview,
  rarities,
  rarityPips,
  rosterQuery,
  unitPounds,
  useItemTemplate,
  usePendingProposalCount,
  useWeightFormat,
  type GiveOutcome,
  type ItemCategory,
  type ItemDefinition,
} from '@/features/inventory'
import { CatalogueShopPicker } from '@/features/shops'
import { formatGp } from '@/shared/lib/money'
import { newRequestId } from '@/shared/lib/request-id'
import { localizedName } from '@/shared/lib/translations'
import './item-store.css'

type View = 'list' | 'grid'
type Sort = 'name' | 'category' | 'rarity' | 'value'
const viewKey = 'rytta-store-view'
function savedView(): View {
  try {
    return localStorage.getItem(viewKey) === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

/** RYT-027 item storeroom: a dense, filterable list (or compact grid) of campaign items with
 * icon actions, inside the DM Command Center. `?create=<characterId>` opens "new item for". */
export function ItemStore({ campaignId }: { campaignId: string }) {
  const { state } = useAuth()
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const query = useQuery(catalogueQuery(state.user!.id, campaignId))
  const roster = useQuery(rosterQuery(state.user!.id, campaignId))
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<ItemCategory | 'all'>('all')
  const [sort, setSort] = useState<Sort>('name')
  const [view, setViewState] = useState<View>(savedView)
  const [editor, setEditor] = useState<{ item: ItemDefinition | null; give?: string[] } | null>(
    null,
  )
  const [give, setGive] = useState<ItemDefinition | true | null>(null)
  const [managing, setManaging] = useState(false)
  const [mergeSource, setMergeSource] = useState<string | null>(null)
  const [shop, setShop] = useState<ItemDefinition | null>(null)
  const [removing, setRemoving] = useState<ItemDefinition | null>(null)
  // RYT-104/105: basic catalogue import, proposal review and duplicate merges.
  const [importing, setImporting] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [merging, setMerging] = useState<ItemDefinition | null>(null)
  const pendingProposals = usePendingProposalCount(campaignId, true)
  const template = useItemTemplate(campaignId)
  const templateRequests = useRef(new Map<string, string>())
  const { format } = useWeightFormat()
  const nameOf = (item: ItemDefinition) => localizedName(item, i18n.language)
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)
  const phone = usePhone()
  // Overlays opened from a ⋯ menu would otherwise "restore" focus to a menu item that no
  // longer exists. Remember the visible trigger and return focus there (RYT-027 F1).
  const trigger = useRef<HTMLElement | null>(null)
  const newButton = useRef<HTMLButtonElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const returnFocus = () =>
    requestAnimationFrame(() =>
      (trigger.current?.isConnected ? trigger.current : newButton.current)?.focus(),
    )
  const remember = (target: HTMLElement | null) => {
    trigger.current = target
  }
  // `?create=<characterId>` opens "new item for" on load and whenever the link changes while the
  // storeroom is already mounted (RYT-027 R2-2). Closing the editor removes the parameter.
  const createFor = params.get('create')
  const [seenCreate, setSeenCreate] = useState<string | null>(null)
  if (createFor !== seenCreate) {
    setSeenCreate(createFor)
    if (createFor) setEditor({ item: null, give: [createFor] })
  }
  const setView = (next: View) => {
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
    const needle = search.trim().toLocaleLowerCase()
    const filtered = all.filter(
      (item) =>
        (category === 'all' || item.category === category) &&
        [item.name, localizedName(item, i18n.language)].some((name) =>
          name.toLocaleLowerCase().includes(needle),
        ),
    )
    const byName = (a: ItemDefinition, b: ItemDefinition) =>
      localizedName(a, i18n.language).localeCompare(localizedName(b, i18n.language), i18n.language)
    return filtered.sort((a, b) => {
      if (sort === 'category')
        return (
          itemCategories.indexOf(a.category) - itemCategories.indexOf(b.category) || byName(a, b)
        )
      if (sort === 'rarity')
        return rarities.indexOf(b.rarity) - rarities.indexOf(a.rarity) || byName(a, b)
      if (sort === 'value') return (b.value_gp ?? -1) - (a.value_gp ?? -1) || byName(a, b)
      return byName(a, b)
    })
  }, [all, category, search, sort, i18n.language])
  const closeEditor = () => {
    setEditor(null)
    // A `?create=` link has no visible opener; fall back to "New item".
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
  const meta = (item: ItemDefinition) =>
    [
      t(`inventory.category.${item.category}`),
      t(`inventory.rarity.${item.rarity}`),
      unitPounds(item) > 0 ? format(unitPounds(item)).replaceAll(' ', '\u00a0') : null,
    ]
      .filter(Boolean)
      .join(' · ')
  const value = (item: ItemDefinition) =>
    item.value_gp === null
      ? t('store.noValue')
      : t('store.value', { value: formatGp(item.value_gp, i18n.language) })
  const actionProps = (item: ItemDefinition) => ({
    item,
    name: nameOf(item),
    onTrigger: remember,
    onEdit: () => setEditor({ item }),
    onGive: () => setGive(item),
    onShop: () => setShop(item),
    onDelete: () => setRemoving(item),
    onMerge: () => setMerging(item),
    onTemplate: () => toggleTemplate(item),
  })
  const filtersActive = category !== 'all' || search.trim().length > 0

  return (
    <section aria-labelledby="store-heading" className="item-store">
      <Group justify="space-between" align="flex-start" gap="sm" mb="sm">
        <div>
          <Group gap="xs" align="center">
            <Title order={2} id="store-heading">
              {t('catalogue.title')}
            </Title>
            {query.data && (
              <Badge variant="light" size="lg">
                {t('store.count', { count: all.length })}
              </Badge>
            )}
          </Group>
        </div>
        <Button
          ref={newButton}
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
      <div className="store-find">
        <TextInput
          className="store-search"
          ref={searchInput}
          aria-label={t('catalogue.search')}
          placeholder={t('catalogue.search')}
          rightSectionWidth={48}
          leftSection={<Search size={16} aria-hidden="true" />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
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
        {all.length > 0 && (
          <Button
            leftSection={<Gift size={18} aria-hidden="true" />}
            onClick={(event) => {
              remember(event.currentTarget)
              setGive(true)
            }}
          >
            {t('loot.open')}
          </Button>
        )}
      </div>
      <div className="store-desk">
        <UnstyledButton
          className="store-desk-link"
          data-waiting={pendingProposals > 0 || undefined}
          onClick={(event) => {
            remember(event.currentTarget)
            setReviewing(true)
          }}
        >
          <Inbox size={18} aria-hidden="true" />
          <span>{t('items.review.open')}</span>
          {pendingProposals > 0 && (
            <span className="store-desk-count">
              {t('items.review.waiting', { count: pendingProposals })}
            </span>
          )}
        </UnstyledButton>
        <UnstyledButton
          className="store-desk-link"
          onClick={(event) => {
            remember(event.currentTarget)
            setMergeSource(null)
            setManaging(true)
          }}
        >
          <PackagePlus size={18} aria-hidden />
          {t('loot.manage')}
        </UnstyledButton>
      </div>

      <details className="store-options">
        <summary>{t('loot.options')}</summary>
        <Group gap="sm">
          <Select
            className="store-sort"
            aria-label={t('store.sort')}
            leftSection={<ArrowUpDown size={16} aria-hidden="true" />}
            value={sort}
            allowDeselect={false}
            onChange={(next) => next && setSort(next as Sort)}
            data={(['name', 'category', 'rarity', 'value'] as const).map((key) => ({
              value: key,
              label: t(`store.sort${key[0]!.toUpperCase()}${key.slice(1)}` as 'store.sortName'),
            }))}
          />
          <SegmentedControl
            className="store-view"
            aria-label={t('store.view')}
            value={view}
            onChange={(next) => setView(next as View)}
            data={[
              {
                value: 'list',
                label: (
                  <span className="view-option" title={t('store.viewList')}>
                    <List size={18} aria-hidden="true" />
                    <VisuallyHidden>{t('store.viewList')}</VisuallyHidden>
                  </span>
                ),
              },
              {
                value: 'grid',
                label: (
                  <span className="view-option" title={t('store.viewGrid')}>
                    <LayoutGrid size={18} aria-hidden="true" />
                    <VisuallyHidden>{t('store.viewGrid')}</VisuallyHidden>
                  </span>
                ),
              },
            ]}
          />
        </Group>
      </details>
      <div className="category-rail store-rail" role="group" aria-label={t('inventory.filter')}>
        {(['all', ...itemCategories] as const)
          .filter((key) => key === 'all' || counts.has(key))
          .map((key) => (
            <UnstyledButton
              key={key}
              aria-pressed={category === key}
              className="category-chip"
              onClick={() => setCategory(key)}
            >
              <ItemIcon icon={key === 'all' ? 'package' : categoryIcons[key]} size={16} />
              <span>{t(`inventory.category.${key}`)}</span>
              <span className="chip-count" aria-hidden="true">
                {key === 'all' ? all.length : counts.get(key)}
              </span>
            </UnstyledButton>
          ))}
      </div>

      {notice && (
        <Alert
          role="status"
          color={notice.tone === 'warn' ? 'orange' : undefined}
          withCloseButton
          closeButtonLabel={t('common.close')}
          onClose={() => setNotice(null)}
          my="sm"
        >
          {notice.text}
        </Alert>
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
      {query.data && items.length === 0 && (
        <Stack align="center" gap="xs" py="xl" className="store-empty">
          <ItemIcon icon="package" size={36} />
          <Text>{t(all.length ? 'store.noResults' : 'items.import.empty')}</Text>
          {all.length === 0 && (
            <Button
              variant="light"
              onClick={(event) => {
                remember(event.currentTarget)
                setImporting(true)
              }}
            >
              {t('items.import.open')}
            </Button>
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
        <ul className="store-list" aria-label={t('catalogue.title')}>
          {items.map((item) => (
            <li key={item.id} className="store-row">
              <UnstyledButton
                className="store-row-main"
                onClick={(event) => {
                  remember(event.currentTarget)
                  setEditor({ item })
                }}
                title={t('store.editItem', { name: nameOf(item) })}
              >
                <span className={`store-glyph rarity-${item.rarity}`} aria-hidden="true">
                  <ItemIcon icon={item.icon} imagePath={item.image_path} size={22} />
                </span>
                <span className="store-row-body">
                  <span className="store-row-name user-copy">
                    <VisuallyHidden>{t('catalogue.edit')}: </VisuallyHidden>
                    {nameOf(item)}
                    {item.is_template && (
                      <span className="store-template-mark" title={t('items.template.mark')}>
                        <BookmarkCheck size={14} aria-hidden="true" />
                        <VisuallyHidden> · {t('items.template.mark')}</VisuallyHidden>
                      </span>
                    )}
                  </span>
                  {/* Phones keep the price beside, not inside, the ellipsized meta line, so it
                      never hides and the name keeps the full width (RYT-027 R2-1, R3-1). */}
                  <span className="store-row-line">
                    <span className="store-row-meta">{meta(item)}</span>
                    {phone && (
                      <span
                        className="store-value"
                        data-empty={item.value_gp === null || undefined}
                      >
                        {value(item)}
                      </span>
                    )}
                  </span>
                </span>
                {!phone && (
                  <span className="store-row-side">
                    <span className="store-origin">{t(`store.origin.${item.origin}`)}</span>
                    <span className="store-value" data-empty={item.value_gp === null || undefined}>
                      {value(item)}
                    </span>
                  </span>
                )}
              </UnstyledButton>
              <ItemActions {...actionProps(item)} compact={phone} />
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && view === 'grid' && (
        <ul className="store-grid" aria-label={t('catalogue.title')}>
          {items.map((item) => (
            <li key={item.id} className={`store-tile rarity-${item.rarity}`}>
              <UnstyledButton
                className="store-tile-main"
                onClick={(event) => {
                  remember(event.currentTarget)
                  setEditor({ item })
                }}
                title={t('store.editItem', { name: nameOf(item) })}
              >
                <span className="store-tile-icon" aria-hidden="true">
                  <ItemIcon icon={item.icon} imagePath={item.image_path} size={30} />
                </span>
                <span className="store-tile-name user-copy">
                  <VisuallyHidden>{t('catalogue.edit')}: </VisuallyHidden>
                  {nameOf(item)}
                  {item.is_template && (
                    <VisuallyHidden> · {t('items.template.mark')}</VisuallyHidden>
                  )}
                </span>
                <span className="store-tile-meta" data-empty={item.value_gp === null || undefined}>
                  {value(item)}
                </span>
                <span className="item-rarity-pips" aria-hidden="true">
                  {'◆'.repeat(rarityPips[item.rarity])}
                </span>
              </UnstyledButton>
              <div className="store-tile-menu">
                <ItemActions {...actionProps(item)} compact />
              </div>
            </li>
          ))}
        </ul>
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
          // The storeroom returns focus itself: to the visible trigger, or to "New item" after a
          // `?create=` link, whatever had focus before the link (RYT-027 R3-2).
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
            // The row is gone: land on "New item" rather than a detached trigger.
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
          onDone={(text) => {
            setImporting(false)
            setNotice({ tone: 'ok', text })
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
          onNotice={(text) => setNotice({ tone: 'ok', text })}
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
          onDone={(text) => {
            setMerging(null)
            // The duplicate's row is gone: land on "New item".
            trigger.current = null
            setNotice({ tone: 'ok', text })
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

/** Give and Shop as icon buttons on wide rows; the rest (and everything when compact) sits in one
 * menu: the template flag, merging a duplicate and delete (RYT-104/105). */
function ItemActions({
  item,
  name,
  compact,
  onTrigger,
  onEdit,
  onGive,
  onShop,
  onDelete,
  onMerge,
  onTemplate,
}: {
  item: ItemDefinition
  name: string
  compact: boolean
  onTrigger: (target: HTMLElement | null) => void
  onEdit: () => void
  onGive: () => void
  onShop: () => void
  onDelete: () => void
  onMerge: () => void
  onTemplate: () => void
}) {
  const { t } = useTranslation()
  const shopable = item.origin !== 'player' || item.value_gp !== null
  const menuButton = useRef<HTMLButtonElement>(null)
  // Run the chosen action only after the menu has closed and returned focus to its ⋯ button,
  // so the overlay that opens next remembers a real element (RYT-027 review F1).
  const pending = useRef<(() => void) | null>(null)
  const choose = (run: () => void) => () => {
    pending.current = run
  }
  return (
    <div className="store-row-actions">
      {/* RYT-151: giving and stocking a shop have consequences, so they sit in the named ⋯ menu
          with their verbs at every width instead of as bare icons. */}
      <Menu
        position="bottom-end"
        withinPortal
        withInitialFocusPlaceholder={false}
        onExitTransitionEnd={() => {
          const run = pending.current
          pending.current = null
          run?.()
        }}
      >
        <Menu.Target>
          <ActionIcon
            ref={menuButton}
            variant="subtle"
            size={44}
            onClick={() => onTrigger(menuButton.current)}
            aria-label={t('store.actionsFor', { name })}
            title={t('common.moreActions')}
          >
            <Ellipsis size={20} aria-hidden="true" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {compact && (
            <Menu.Item
              leftSection={<Pencil size={18} aria-hidden="true" />}
              onClick={choose(onEdit)}
            >
              {t('catalogue.edit')}
            </Menu.Item>
          )}
          <>
            <Menu.Item leftSection={<Gift size={18} aria-hidden="true" />} onClick={choose(onGive)}>
              {t('catalogue.give')}
            </Menu.Item>
            {shopable && (
              <Menu.Item
                leftSection={<Store size={18} aria-hidden="true" />}
                onClick={choose(onShop)}
              >
                {t('catalogue.addToShop')}
              </Menu.Item>
            )}
          </>
          <Menu.Item
            leftSection={
              item.is_template ? (
                <BookmarkCheck size={18} aria-hidden="true" />
              ) : (
                <Bookmark size={18} aria-hidden="true" />
              )
            }
            onClick={onTemplate}
          >
            {t(item.is_template ? 'items.template.remove' : 'items.template.add')}
          </Menu.Item>
          <Menu.Item
            leftSection={<GitMerge size={18} aria-hidden="true" />}
            onClick={choose(onMerge)}
          >
            {t('items.merge.open')}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            color="var(--danger)"
            leftSection={<Trash2 size={18} aria-hidden="true" />}
            onClick={choose(onDelete)}
          >
            {t('store.delete')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  )
}
