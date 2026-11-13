import { useMemo, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  Loader,
  Menu,
  Select,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core'
import { usePhone } from '@/shared/ui/use-viewport'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpDown,
  Check,
  Ellipsis,
  Gift,
  LayoutGrid,
  List,
  Minus,
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
  catalogueQuery,
  categoryIcons,
  CharacterPortrait,
  DefinitionEditor,
  DeleteItemDialog,
  formatPounds,
  ItemIcon,
  itemCategories,
  rarities,
  rarityPips,
  rosterQuery,
  useInventoryAction,
  type GiveOutcome,
  type ItemCategory,
  type ItemDefinition,
} from '@/features/inventory'
import { CatalogueShopPicker } from '@/features/shops'
import { newRequestId } from '@/shared/lib/request-id'

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
  const [give, setGive] = useState<ItemDefinition | null>(null)
  const [shop, setShop] = useState<ItemDefinition | null>(null)
  const [removing, setRemoving] = useState<ItemDefinition | null>(null)
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
        item.name.toLocaleLowerCase().includes(needle),
    )
    const byName = (a: ItemDefinition, b: ItemDefinition) =>
      a.name.localeCompare(b.name, i18n.language)
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
        text: t('lifecycle.syncDone', { name: item.name, count: repriced }),
      })
    else if (outcome?.failed.length)
      setNotice({
        tone: 'warn',
        text: t('store.givePartial', { name: item.name, names: outcome.failed.join(', ') }),
      })
    else if (outcome?.given.length)
      setNotice({
        tone: 'ok',
        text: t('store.createdFor', { name: item.name, names: outcome.given.join(', ') }),
      })
    else setNotice({ tone: 'ok', text: t('catalogue.savedName', { name: item.name }) })
  }
  const meta = (item: ItemDefinition) =>
    [
      t(`inventory.category.${item.category}`),
      t(`inventory.rarity.${item.rarity}`),
      t('store.weight', { value: formatPounds(item.weight_tenths / 10, i18n.language) }),
    ].join(' · ')
  const value = (item: ItemDefinition) =>
    item.value_gp === null
      ? t('store.noValue')
      : t('store.value', { value: item.value_gp.toLocaleString(i18n.language) })
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
          leftSection={<Plus size={18} aria-hidden="true" />}
          onClick={(event) => {
            remember(event.currentTarget)
            setEditor({ item: null })
          }}
        >
          {t('catalogue.create')}
        </Button>
      </Group>

      <div className="store-toolbar">
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
      </div>
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
          <Text>{t(all.length ? 'store.noResults' : 'catalogue.empty')}</Text>
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
                title={t('store.editItem', { name: item.name })}
              >
                <span className={`store-glyph rarity-${item.rarity}`} aria-hidden="true">
                  <ItemIcon icon={item.icon} imagePath={item.image_path} size={22} />
                </span>
                <span className="store-row-body">
                  <span className="store-row-name user-copy">
                    <VisuallyHidden>{t('catalogue.edit')}: </VisuallyHidden>
                    {item.name}
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
              <ItemActions
                item={item}
                compact={phone}
                onTrigger={remember}
                onEdit={() => setEditor({ item })}
                onGive={() => setGive(item)}
                onShop={() => setShop(item)}
                onDelete={() => setRemoving(item)}
              />
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
                title={t('store.editItem', { name: item.name })}
              >
                <span className="store-tile-icon" aria-hidden="true">
                  <ItemIcon icon={item.icon} imagePath={item.image_path} size={30} />
                </span>
                <span className="store-tile-name user-copy">
                  <VisuallyHidden>{t('catalogue.edit')}: </VisuallyHidden>
                  {item.name}
                </span>
                <span className="store-tile-meta" data-empty={item.value_gp === null || undefined}>
                  {value(item)}
                </span>
                <span className="item-rarity-pips" aria-hidden="true">
                  {'◆'.repeat(rarityPips[item.rarity])}
                </span>
              </UnstyledButton>
              <div className="store-tile-menu">
                <ItemActions
                  item={item}
                  compact
                  onTrigger={remember}
                  onEdit={() => setEditor({ item })}
                  onGive={() => setGive(item)}
                  onShop={() => setShop(item)}
                  onDelete={() => setRemoving(item)}
                />
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
        <GiveItem
          campaignId={campaignId}
          item={give}
          onClose={() => {
            setGive(null)
            returnFocus()
          }}
          onDone={(names) => {
            setGive(null)
            setNotice({ tone: 'ok', text: t('store.givenTo', { name: give.name, names }) })
            returnFocus()
          }}
        />
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
            setNotice({ tone: 'ok', text: t('lifecycle.deleted', { name: item.name }) })
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

/** Give and Shop as icon buttons on wide rows; everything folds into one menu when compact. */
function ItemActions({
  item,
  compact,
  onTrigger,
  onEdit,
  onGive,
  onShop,
  onDelete,
}: {
  item: ItemDefinition
  compact: boolean
  onTrigger: (target: HTMLElement | null) => void
  onEdit: () => void
  onGive: () => void
  onShop: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const shopable = item.origin !== 'player'
  const menuButton = useRef<HTMLButtonElement>(null)
  // Run the chosen action only after the menu has closed and returned focus to its ⋯ button,
  // so the overlay that opens next remembers a real element (RYT-027 review F1).
  const pending = useRef<(() => void) | null>(null)
  const choose = (run: () => void) => () => {
    pending.current = run
  }
  if (!compact)
    return (
      <div className="store-row-actions">
        <Tooltip label={t('catalogue.give')} openDelay={300} withinPortal>
          <ActionIcon
            variant="subtle"
            size={44}
            aria-label={t('store.giveItem', { name: item.name })}
            onClick={(event) => {
              onTrigger(event.currentTarget)
              onGive()
            }}
          >
            <Gift size={19} aria-hidden="true" />
          </ActionIcon>
        </Tooltip>
        {shopable && (
          <Tooltip label={t('catalogue.addToShop')} openDelay={300} withinPortal>
            <ActionIcon
              variant="subtle"
              size={44}
              aria-label={t('store.shopItem', { name: item.name })}
              onClick={(event) => {
                onTrigger(event.currentTarget)
                onShop()
              }}
            >
              <Store size={19} aria-hidden="true" />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label={t('store.delete')} openDelay={300} withinPortal>
          <ActionIcon
            variant="subtle"
            color="red"
            size={44}
            className="store-delete"
            aria-label={t('store.deleteItem', { name: item.name })}
            onClick={(event) => {
              onTrigger(event.currentTarget)
              onDelete()
            }}
          >
            <Trash2 size={19} aria-hidden="true" />
          </ActionIcon>
        </Tooltip>
      </div>
    )
  return (
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
          aria-label={t('store.actionsFor', { name: item.name })}
          title={t('common.moreActions')}
        >
          <Ellipsis size={20} aria-hidden="true" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<Pencil size={18} aria-hidden="true" />} onClick={choose(onEdit)}>
          {t('catalogue.edit')}
        </Menu.Item>
        <Menu.Item leftSection={<Gift size={18} aria-hidden="true" />} onClick={choose(onGive)}>
          {t('catalogue.give')}
        </Menu.Item>
        {shopable && (
          <Menu.Item leftSection={<Store size={18} aria-hidden="true" />} onClick={choose(onShop)}>
            {t('catalogue.addToShop')}
          </Menu.Item>
        )}
        <Menu.Divider />
        <Menu.Item
          color="red"
          leftSection={<Trash2 size={18} aria-hidden="true" />}
          onClick={choose(onDelete)}
        >
          {t('store.delete')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

/** Give an existing item to one or more characters with an amount stepper. Each character keeps
 * its own idempotency key, so retrying after a partial failure never doubles a grant. */
function GiveItem({
  campaignId,
  item,
  onClose,
  onDone,
}: {
  campaignId: string
  item: ItemDefinition
  onClose: () => void
  onDone: (names: string) => void
}) {
  const { state } = useAuth()
  const { t } = useTranslation()
  const roster = useQuery(rosterQuery(state.user!.id, campaignId))
  const action = useInventoryAction(campaignId)
  const [selected, setSelected] = useState<string[]>([])
  const [given, setGiven] = useState<string[]>([])
  const [amount, setAmount] = useState(1)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState<string[]>([])
  const requests = useRef(new Map<string, string>())
  const opener = useRef(document.activeElement as HTMLElement | null)
  const phone = usePhone()
  const dismiss = () => {
    onClose()
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus()
    })
  }
  const submit = async () => {
    if (pending || selected.length === 0) return
    setPending(true)
    setFailed([])
    const done = [...given]
    const missed: string[] = []
    for (const characterId of selected.filter((id) => !given.includes(id))) {
      if (!requests.current.has(characterId)) requests.current.set(characterId, newRequestId())
      try {
        await action.mutateAsync({
          kind: 'grant',
          characterId,
          definitionId: item.id,
          amount,
          requestId: requests.current.get(characterId),
        })
        done.push(characterId)
      } catch {
        missed.push(characterId)
      }
    }
    setFailed(missed)
    setGiven(done)
    setPending(false)
    if (done.length === selected.length) {
      const names = selected
        .map((id) => roster.data?.find((c) => c.id === id)?.name ?? '')
        .filter(Boolean)
        .join(', ')
      onDone(names)
      requestAnimationFrame(() => {
        if (opener.current?.isConnected) opener.current.focus()
      })
    }
  }
  return (
    <Drawer
      opened
      position={phone ? 'bottom' : 'right'}
      size={phone ? 'auto' : 420}
      title={t('catalogue.give')}
      returnFocus={false}
      onClose={() => !pending && dismiss()}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
      className="give-drawer"
    >
      <Stack>
        <Group gap="sm" wrap="nowrap">
          <ItemIcon
            icon={item.icon}
            imagePath={item.image_path}
            size={22}
            viewable
            name={item.name}
            frame={`store-glyph rarity-${item.rarity}`}
          />
          <Text fw={600} className="user-copy">
            {item.name}
          </Text>
        </Group>
        {roster.isPending && <Text role="status">{t('common.loading')}</Text>}
        {roster.isError && (
          <Alert role="alert" color="red">
            {t('query.error')}{' '}
            <Button variant="subtle" onClick={() => void roster.refetch()}>
              {t('common.retry')}
            </Button>
          </Alert>
        )}
        {roster.data?.length === 0 && <Text>{t('inventory.noCharacters')}</Text>}
        {!!roster.data?.length && (
          <fieldset className="plain-fieldset">
            <legend>
              <Text fw={600} size="sm" mb={6}>
                {t('catalogue.character')}
              </Text>
            </legend>
            <div className="give-roster wrap" role="group">
              {roster.data.map((c) => (
                <UnstyledButton
                  key={c.id}
                  type="button"
                  aria-pressed={selected.includes(c.id)}
                  aria-disabled={given.includes(c.id) || undefined}
                  className="give-target"
                  onClick={() =>
                    !given.includes(c.id) &&
                    setSelected((current) =>
                      current.includes(c.id)
                        ? current.filter((id) => id !== c.id)
                        : [...current, c.id],
                    )
                  }
                >
                  <CharacterPortrait
                    campaignId={campaignId}
                    characterId={c.id}
                    name={c.name}
                    path={null}
                    size={40}
                  />
                  <span className="user-copy">{c.name}</span>
                  {given.includes(c.id) && (
                    <span className="give-served">
                      <Check size={16} aria-hidden="true" />
                      <VisuallyHidden>{t('store.served')}</VisuallyHidden>
                    </span>
                  )}
                </UnstyledButton>
              ))}
            </div>
          </fieldset>
        )}
        <div>
          <Text fw={600} size="sm" mb={6} id="give-amount">
            {t('inventory.card.amount')}
          </Text>
          <Group gap="xs" role="group" aria-labelledby="give-amount" wrap="nowrap">
            <ActionIcon
              variant="default"
              size={44}
              aria-label={t('characters.decrease', { field: t('inventory.card.amount') })}
              aria-disabled={amount <= 1 || undefined}
              onClick={() => setAmount((current) => Math.max(1, current - 1))}
            >
              <Minus size={18} aria-hidden="true" />
            </ActionIcon>
            <Text className="give-amount" aria-live="polite">
              {amount}
            </Text>
            <ActionIcon
              variant="default"
              size={44}
              aria-label={t('characters.increase', { field: t('inventory.card.amount') })}
              aria-disabled={amount >= 1000 || undefined}
              onClick={() => setAmount((current) => Math.min(1000, current + 1))}
            >
              <Plus size={18} aria-hidden="true" />
            </ActionIcon>
            {[5, 10].map((step) => (
              <Button
                key={step}
                variant="default"
                onClick={() => setAmount((current) => Math.min(1000, current + step))}
              >
                +{step}
              </Button>
            ))}
          </Group>
        </div>
        {failed.length > 0 && (
          <Alert role="alert" color="red">
            {t('store.giveFailed', {
              names: failed
                .map((id) => roster.data?.find((c) => c.id === id)?.name ?? '')
                .filter(Boolean)
                .join(', '),
            })}
          </Alert>
        )}
        <Button
          leftSection={pending ? <Loader size={16} /> : <Gift size={18} aria-hidden="true" />}
          aria-busy={pending}
          aria-disabled={pending || selected.length === 0 || undefined}
          onClick={() => void submit()}
        >
          {t(failed.length ? 'common.retry' : 'catalogue.give')}
        </Button>
      </Stack>
    </Drawer>
  )
}
