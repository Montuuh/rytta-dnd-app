import { GlossaryText } from '@/features/glossary'
import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Chip,
  Combobox,
  Group,
  Paper,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  UnstyledButton,
  useCombobox,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import {
  Check,
  ChevronsUpDown,
  Handshake,
  HandCoins,
  Lock,
  Tag,
  ScrollText,
  Search,
  ShoppingBag,
  Store,
  Zap,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { PageHead } from '@/shared/ui/page-head'
import { usePhone } from '@/shared/ui/use-viewport'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import {
  QueryFeedback,
  showsData,
  StaleLine,
  useCampaign,
  useCampaignView,
} from '@/features/campaigns'
import {
  EmptyPanel,
  itemCategories,
  Stepper,
  type ItemCategory,
  type ItemDefinition,
  type ItemStack,
} from '@/features/inventory'
import {
  liveOrders,
  ordersQuery,
  storefrontQuery,
  useHoldings,
  useShopAction,
  useShopCharacter,
} from '../api'
import {
  cartTotal,
  filterListings,
  isOpenOrder,
  ownership,
  reconcileCart,
  sellableUnits,
  ShopError,
  sumGp,
  toCents,
  type SaleLine,
  type OrderResult,
  type ShopAction,
  type StorefrontShop,
} from '../domain/shops'
import { CartDrawer } from './cart-drawer'
import { ListingCard, ListingDrawer } from './listing-card'
import { OrderCard } from './orders'
import { EmptyNote, GoldAmount, ItemGlyph } from './visuals'
import { newRequestId } from '@/shared/lib/request-id'
import { localizedName } from '@/shared/lib/translations'
import { useGp } from './use-gp'
import { useStoredCart } from './use-stored-cart'
import { ShopBanner, ShopThumb } from './shop-image'
import { ShopKind } from './shop-type-picker'
import { findShopType } from '../domain/shop-types'

type Notice = { text: string; inventoryLink?: boolean }
/** Shelves up to this size are scanned by eye; a search field only adds a step. */
const SEARCH_FROM = 6

export function Storefront() {
  const { t } = useTranslation()
  const gp = useGp()
  const { state } = useAuth()
  const campaign = useCampaign()
  const { playerPreview, previewLabel } = useCampaignView()
  const acting = useShopCharacter()
  const character = acting.selected
  const userId = state.user!.id
  const front = useQuery({
    ...storefrontQuery(userId, campaign.id, character?.id ?? ''),
    enabled: !!character,
  })
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'buy'
  const orders = useQuery({
    ...ordersQuery(userId, campaign.id, character?.id ?? null),
    // The Player waits on the DM's answer while "My orders" is on screen (see liveOrders).
    ...(tab === 'orders' ? liveOrders : {}),
    enabled: !!character,
  })
  const holdings = useHoldings(character?.id)
  const action = useShopAction(campaign.id)
  const stored = useStoredCart(campaign.id, character?.id ?? null)
  const { carts, notes } = stored
  const phone = usePhone()
  const [cartOpen, setCartOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<ItemCategory | 'all'>('all')
  const opener = useRef<HTMLElement | null>(null)

  const shops = front.data?.shops ?? []
  const shop = shops.find((s) => s.id === params.get('shop')) ?? shops[0] ?? null
  const entries = holdings.stacks
  const gold = front.data?.gold ?? 0
  const canBuy = !playerPreview && !!shop?.is_open
  const canSellHere = !playerPreview && !!shop && shop.is_open && shop.resale_percent > 0
  const groups = shops.flatMap((merchant) => {
    const items = reconcileCart(carts[merchant.id] ?? [], merchant.listings)
    return items.length ? [{ shop: merchant, lines: items, note: notes[merchant.id] ?? '' }] : []
  })
  const lines = groups.find((group) => group.shop.id === shop?.id)?.lines ?? []
  const units = groups.reduce(
    (sum, group) => sum + group.lines.reduce((n, line) => n + line.quantity, 0),
    0,
  )
  const total = sumGp(
    groups.map((group) => cartTotal(group.lines, group.shop.listings, group.shop.mode)),
  )
  const [checkingOut, setCheckingOut] = useState(false)
  const submitting = useRef(false)
  const attempts = useRef(new Map<string, { payload: string; requestId: string }>())
  const [checkoutError, setCheckoutError] = useState('')
  const openOrders = (orders.data ?? []).filter(isOpenOrder)

  const setParam = (key: string, value: string) =>
    setParams(
      (prior) => {
        const next = new URLSearchParams(prior)
        next.set(key, value)
        return next
      },
      { replace: true },
    )
  const setLines = stored.setCart
  // Sets one line to an exact quantity (0 removes it); the stepper on the listing card uses it.
  const setQuantity = (listingId: string, quantity: number) => {
    if (!shop) return
    setLines(
      shop.id,
      quantity <= 0
        ? lines.filter((line) => line.listingId !== listingId)
        : lines.map((line) => (line.listingId === listingId ? { ...line, quantity } : line)),
    )
  }
  const add = (listingId: string, quantity: number) => {
    const current = lines.find((line) => line.listingId === listingId)
    if (!shop) return
    setLines(
      shop.id,
      current
        ? lines.map((line) =>
            line.listingId === listingId ? { ...line, quantity: line.quantity + quantity } : line,
          )
        : [...lines, { listingId, quantity, offeredPrice: null }],
    )
    setNotice(null)
  }
  const perform = (next: ShopAction, onDone?: (result: OrderResult | null) => void) => {
    setNotice(null)
    action.mutate(next, { onSuccess: (result) => onDone?.(result.order) })
  }
  const openCart = () => {
    setCheckoutError('')
    setNotice(null)
    setCartOpen(true)
  }
  const checkout = async () => {
    if (!character || playerPreview || !groups.length || submitting.current) return
    submitting.current = true
    setCheckingOut(true)
    setCheckoutError('')
    setNotice(null)
    const receipts: string[] = []
    let bought = false
    try {
      for (const group of groups) {
        const { shop: merchant, lines: items, note } = group
        const payload = JSON.stringify([character.id, items, note])
        const previous = attempts.current.get(merchant.id)
        const requestId = previous?.payload === payload ? previous.requestId : newRequestId()
        attempts.current.set(merchant.id, { payload, requestId })
        try {
          const { order } = await action.mutateAsync({
            kind: 'checkout',
            shopId: merchant.id,
            characterId: character.id,
            lines: items,
            note,
            requestId,
          })
          if (!order) throw new ShopError('unavailable')
          attempts.current.delete(merchant.id)
          setLines(merchant.id, [])
          stored.setNote(merchant.id, '')
          if (order.status === 'completed') {
            bought = true
            receipts.push(t('shop.notice.bought', { value: gp(order.total) }))
          } else {
            receipts.push(t('shop.notice.requested', { shop: merchant.name }))
          }
        } catch (error) {
          setCheckoutError(
            merchant.name +
              ' · ' +
              t(`commerce.error.${error instanceof ShopError ? error.code : 'unavailable'}`),
          )
          return
        }
      }
      setCartOpen(false)
    } finally {
      if (receipts.length) setNotice({ text: receipts.join(' '), inventoryLink: bought })
      submitting.current = false
      setCheckingOut(false)
    }
  }
  const failure = action.error
  const failureText = failure
    ? t(`commerce.error.${failure instanceof ShopError ? failure.code : 'unavailable'}`)
    : ''
  // An order's refusal belongs inside that order; anything else is shown above the tabs.
  const failedOrder =
    failure && action.variables && 'orderId' in action.variables ? action.variables.orderId : null
  const detail = shop?.listings.find((l) => l.id === detailId) ?? null
  const kinds = itemCategories.filter((k) => shop?.listings.some((l) => l.item.category === k))
  const visible = shop ? filterListings(shop.listings, search, kind) : []

  return (
    <Stack gap="lg" className="storefront">
      <PageHead title={t('shop.title')}>
        {playerPreview && previewLabel && (
          <Text c="dimmed" mt="xs">
            {t('shop.previewReadOnly', { name: previewLabel })}
          </Text>
        )}
      </PageHead>
      <StaleLine queries={[acting.characters, front, orders]} />
      <QueryFeedback
        pending={acting.characters.isPending || (!!character && front.isPending)}
        error={!showsData(acting.characters) || !showsData(front)}
        cause={!showsData(acting.characters) ? acting.characters.error : front.error}
        retry={() =>
          void (acting.characters.isError ? acting.characters.refetch() : front.refetch())
        }
      />
      {!acting.characters.isPending && !character && (
        <Paper p="xl">
          <Text>{t('shop.noCharacter')}</Text>
        </Paper>
      )}
      {front.data && shops.length === 0 && (
        <Paper p="xl" className="empty-state">
          <Stack gap="xs">
            <Title order={2} size="h3">
              {t('shop.emptyTitle')}
            </Title>
            <Text c="dimmed">{t('shop.emptyHelp')}</Text>
          </Stack>
        </Paper>
      )}
      {front.data && shop && (
        <>
          <ShopHeader
            shop={shop}
            shops={shops}
            onSelect={(id) => {
              if (id === shop.id) return
              setParam('shop', id)
              setSearch('')
              setKind('all')
            }}
          />
          <div className="purse-bar">
            <div>
              <Text size="xs" c="dimmed">
                {t('shop.purseOf', { name: character?.name ?? '' })}
              </Text>
              <GoldAmount value={gold} size="lg" />
            </div>
            {/* One cart button: the dock on a phone's buy tab, this one everywhere else. */}
            {!playerPreview && units > 0 && (tab !== 'buy' || !phone) && (
              <Button
                leftSection={<ShoppingBag size={18} aria-hidden="true" />}
                onClick={openCart}
                aria-label={t('cart.openNamed', {
                  count: units,
                  value: gp(total),
                })}
              >
                {t('cart.button', {
                  count: units,
                  value: gp(total),
                })}
              </Button>
            )}
          </div>
          {notice && !cartOpen && (
            <Alert
              role="status"
              withCloseButton
              onClose={() => setNotice(null)}
              closeButtonLabel={t('common.close')}
            >
              {notice.text}{' '}
              {notice.inventoryLink && (
                <Link to={`/campaign/${campaign.id}/inventory`} className="notice-link">
                  {t('shop.notice.seeInventory')}
                </Link>
              )}
            </Alert>
          )}
          {failure && action.variables?.kind !== 'checkout' && !failedOrder && (
            <FocusedAlert message={failureText} />
          )}
          <Tabs
            value={tab}
            onChange={(value) => setParam('tab', value ?? 'buy')}
            keepMounted={false}
          >
            <Tabs.List>
              <Tabs.Tab value="buy" leftSection={<ShoppingBag size={16} aria-hidden="true" />}>
                {t('shop.tab.buy')}
              </Tabs.Tab>
              <Tabs.Tab value="sell" leftSection={<HandCoins size={16} aria-hidden="true" />}>
                {t('shop.tab.sell')}
              </Tabs.Tab>
              <Tabs.Tab
                value="orders"
                leftSection={<ScrollText size={16} aria-hidden="true" />}
                rightSection={
                  openOrders.length > 0 ? (
                    <Badge size="sm" circle>
                      {openOrders.length}
                    </Badge>
                  ) : null
                }
              >
                {t('shop.tab.orders')}
              </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="buy" pt="md">
              <Stack gap="md">
                {/* Filters earn their space: search past a short shelf, chips past one kind. */}
                {shop.listings.length > SEARCH_FROM && (
                  <TextInput
                    label={t('shop.search')}
                    leftSection={<Search size={16} aria-hidden="true" />}
                    value={search}
                    onChange={(event) => setSearch(event.currentTarget.value)}
                  />
                )}
                {kinds.length > 1 && (
                  <Chip.Group
                    value={kind}
                    onChange={(value) => setKind(value as ItemCategory | 'all')}
                  >
                    <Group
                      gap="xs"
                      className="kind-filter"
                      role="group"
                      aria-label={t('shop.filterKind')}
                    >
                      <Chip value="all">{t('shop.allKinds')}</Chip>
                      {kinds.map((k) => (
                        <Chip key={k} value={k}>
                          {t(`inventory.category.${k}`)}
                        </Chip>
                      ))}
                    </Group>
                  </Chip.Group>
                )}
                {shop.modifier !== 0 && shop.listings.length > 0 && (
                  <Text
                    size="sm"
                    fw={600}
                    className={`shop-modifier ${shop.modifier < 0 ? 'modifier-discount' : 'modifier-markup'}`}
                  >
                    <Tag size={16} aria-hidden="true" />
                    {shop.modifier < 0
                      ? t('shop.discount', { value: -shop.modifier })
                      : t('shop.markup', { value: shop.modifier })}
                  </Text>
                )}
                {shop.listings.length === 0 ? (
                  <EmptyPanel
                    art="shop"
                    title={t('shop.noListings')}
                    action={
                      canSellHere ? (
                        <Button
                          leftSection={<HandCoins size={16} aria-hidden="true" />}
                          onClick={() => setParam('tab', 'sell')}
                        >
                          {t('shop.tab.sell')}
                        </Button>
                      ) : undefined
                    }
                  >
                    {canSellHere
                      ? t('shop.noListingsSell')
                      : playerPreview
                        ? t('shop.noListingsPreview')
                        : t('shop.noListingsWait')}
                  </EmptyPanel>
                ) : (
                  <div className="listing-grid">
                    {visible.map((listing) => (
                      <ListingCard
                        key={listing.id}
                        listing={listing}
                        ownership={ownership(entries, listing.item.id)}
                        inCart={lines.find((l) => l.listingId === listing.id)?.quantity ?? 0}
                        canBuy={canBuy}
                        inventoryHref={`/campaign/${campaign.id}/inventory`}
                        onOpen={(target) => {
                          opener.current = target
                          setDetailId(listing.id)
                        }}
                        onAdd={() => add(listing.id, 1)}
                        onSet={(quantity) => setQuantity(listing.id, quantity)}
                      />
                    ))}
                  </div>
                )}
                {visible.length === 0 && shop.listings.length > 0 && (
                  <EmptyNote icon={Search}>{t('shop.noMatches')}</EmptyNote>
                )}
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="sell" pt="md">
              <SellPanel
                shop={shop}
                stacks={entries}
                definitions={holdings.definitions}
                readOnly={playerPreview}
                busy={action.isPending}
                onSell={(saleLines, note) =>
                  character &&
                  perform(
                    {
                      kind: 'sell',
                      shopId: shop.id,
                      characterId: character.id,
                      lines: saleLines,
                      note,
                      requestId: newRequestId(),
                    },
                    (result) =>
                      setNotice(
                        result?.status === 'completed'
                          ? { text: t('shop.notice.sold', { value: gp(result.total) }) }
                          : { text: t('shop.notice.saleRequested', { shop: shop.name }) },
                      ),
                  )
                }
              />
            </Tabs.Panel>
            <Tabs.Panel value="orders" pt="md">
              {/* Orders span every shop, unlike the buy and sell shelves above. */}
              <Text size="sm" c="dimmed" mb="sm">
                {t('shop.ordersAllShops')}
              </Text>
              <QueryFeedback
                pending={orders.isPending}
                error={!showsData(orders)}
                cause={orders.error}
                retry={() => void orders.refetch()}
              />
              {orders.data?.length === 0 && (
                <EmptyNote icon={ScrollText}>{t('order.emptyPlayer')}</EmptyNote>
              )}
              <Stack gap="sm">
                {orders.data?.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    role={playerPreview ? 'viewer' : 'player'}
                    busy={action.isPending}
                    gold={gold}
                    error={failedOrder === order.id ? failureText : null}
                    onAction={(next) =>
                      perform(
                        next,
                        (result) =>
                          result &&
                          setNotice({
                            text: t(`order.notice.${result.status}`, { value: gp(result.total) }),
                          }),
                      )
                    }
                  />
                ))}
              </Stack>
            </Tabs.Panel>
          </Tabs>
          {!playerPreview && units > 0 && tab === 'buy' && phone && (
            <div className="cart-dock">
              <Button
                fullWidth
                size="lg"
                leftSection={<ShoppingBag size={18} aria-hidden="true" />}
                onClick={openCart}
              >
                {t('cart.review', {
                  count: units,
                  value: gp(total),
                })}
              </Button>
            </div>
          )}
          <ListingDrawer
            listing={detail}
            ownership={detail ? ownership(entries, detail.item.id) : { owned: 0, equipped: 0 }}
            inCart={detail ? (lines.find((l) => l.listingId === detail.id)?.quantity ?? 0) : 0}
            canBuy={canBuy}
            inventoryHref={`/campaign/${campaign.id}/inventory`}
            onClose={() => {
              setDetailId(null)
              requestAnimationFrame(() => opener.current?.isConnected && opener.current.focus())
            }}
            onAdd={(quantity) => detail && add(detail.id, quantity)}
          />
          <CartDrawer
            opened={cartOpen}
            groups={groups}
            error={checkoutError}
            receipt={cartOpen ? notice?.text : undefined}
            gold={gold}
            tenths={holdings.tenths}
            strength={holdings.strength}
            busy={checkingOut}
            onClose={() => {
              if (!submitting.current) setCartOpen(false)
            }}
            onChange={setLines}
            onNote={stored.setNote}
            onSubmit={checkout}
          />
        </>
      )}
    </Stack>
  )
}

/** The merchant's wax seal: their initial, dimmed when the shop is closed. */
function ShopSeal({ shop, size = 'md' }: { shop: StorefrontShop; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`shop-seal shop-seal-${size}${shop.is_open ? '' : ' is-closed'}`}
      aria-hidden="true"
    >
      {shop.is_open ? (
        Array.from(shop.name.trim())[0]?.toLocaleUpperCase() || <Store size={18} />
      ) : (
        <Lock size={size === 'sm' ? 14 : 18} />
      )}
    </span>
  )
}

const modeIcons = { auto: Zap, approval: Handshake } as const

/** How buying works here: the mode as the header's one badge. Its explanation is a visible line
 * (`ModeHelp`), because a tooltip cannot be opened by touch. */
function ModeBadge({ shop }: { shop: StorefrontShop }) {
  const { t } = useTranslation()
  const Icon = modeIcons[shop.mode]
  return (
    <Badge variant="light" leftSection={<Icon size={14} aria-hidden="true" />}>
      {t(`shop.mode.${shop.mode}`)}
    </Badge>
  )
}

/** An error shown above the tabs; it takes focus so it is read where the reader is looking. */
function FocusedAlert({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [message])
  return (
    <Alert color="red" role="alert" ref={ref} tabIndex={-1}>
      {message}
    </Alert>
  )
}

/**
 * The shop sign doubles as the shop picker when several merchants are open to the character:
 * the name is a select-only combobox listing each merchant with its state, so switching shops
 * costs no extra row of buttons above the header.
 */
function ShopPicker({
  shop,
  shops,
  onSelect,
}: {
  shop: StorefrontShop
  shops: StorefrontShop[]
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
    onDropdownOpen: () => combobox.updateSelectedOptionIndex('active'),
  })
  return (
    <Combobox
      store={combobox}
      position="bottom-start"
      middlewares={{ flip: true, shift: { padding: 16 } }}
      width="max-content"
      offset={6}
      onOptionSubmit={(id) => {
        onSelect(id)
        combobox.closeDropdown()
      }}
    >
      <Combobox.Target targetType="button" withExpandedAttribute>
        <UnstyledButton
          className="shop-picker-trigger"
          aria-label={`${shop.name}. ${t('shop.picker.hint', { count: shops.length })}`}
          onClick={() => combobox.toggleDropdown()}
        >
          <span className="user-copy shop-picker-name">{shop.name}</span>
          <ChevronsUpDown size={20} aria-hidden="true" className="shop-picker-chevron" />
        </UnstyledButton>
      </Combobox.Target>
      <Combobox.Dropdown className="shop-picker-dropdown">
        <Combobox.Options aria-label={t('shop.picker.label')}>
          {shops.map((s) => (
            <Combobox.Option
              key={s.id}
              value={s.id}
              active={s.id === shop.id}
              aria-selected={s.id === shop.id}
              className="shop-picker-option"
            >
              {s.image_path || (s.kind && findShopType(s.kind)) ? (
                <ShopThumb path={s.image_path} kind={s.kind} />
              ) : (
                <ShopSeal shop={s} size="sm" />
              )}
              <span className="shop-picker-option-body">
                <span className="shop-picker-option-name user-copy">{s.name}</span>
                <span className="shop-picker-option-meta">
                  {s.is_open ? t(`shop.mode.${s.mode}`) : t('shop.closed')}
                </span>
              </span>
              {s.id === shop.id && <Check size={18} aria-hidden="true" />}
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  )
}

function ShopHeader({
  shop,
  shops,
  onSelect,
}: {
  shop: StorefrontShop
  shops: StorefrontShop[]
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const title = (
    <>
      <ShopKind kind={shop.kind} className="shop-sign-kind" />
      {/* Name first, mode badge beside it while it fits; flex-wrap moves it below. */}
      <div className="shop-title-row">
        <Title order={2} className="shop-title">
          {shops.length > 1 ? (
            <ShopPicker shop={shop} shops={shops} onSelect={onSelect} />
          ) : (
            <span className="user-copy">{shop.name}</span>
          )}
        </Title>
        <div className="shop-title-badges">
          <ModeBadge shop={shop} />
          {!shop.is_open && (
            <span className="shop-closed-flag">
              <Lock size={14} aria-hidden="true" />
              {t('shop.closed')}
            </span>
          )}
        </div>
      </div>
    </>
  )
  const details = (
    <>
      <Text size="sm" className="shop-mode-help">
        {t(`shop.modeHelp.${shop.mode}`)}
      </Text>
      {shop.description && (
        <Text c="dimmed" className="user-copy shop-description">
          <GlossaryText text={shop.description} />
        </Text>
      )}
      {!shop.is_open && (
        <Text size="sm" className="shop-closed-note">
          {t('shop.closedHelp')}
        </Text>
      )}
    </>
  )
  const closed = shop.is_open ? '' : ' is-closed'
  return (
    <ShopBanner
      path={shop.image_path}
      kind={shop.kind}
      name={shop.name}
      fallback={
        <Paper p="lg" className={`shop-header shop-sign${closed}`}>
          <ShopSeal shop={shop} />
          <div className="shop-sign-body">
            {title}
            {details}
          </div>
        </Paper>
      }
      overlay={<div className={`shop-banner-title${closed}`}>{title}</div>}
      after={details}
    />
  )
}

function SellPanel({
  shop,
  stacks,
  definitions,
  readOnly,
  busy,
  onSell,
}: {
  shop: StorefrontShop
  stacks: ItemStack[]
  definitions: Map<string, ItemDefinition>
  readOnly: boolean
  busy: boolean
  onSell: (lines: SaleLine[], note: string) => void
}) {
  const { t, i18n } = useTranslation()
  const gp = useGp()
  const [amounts, setAmounts] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  if (shop.resale_percent === 0)
    return <EmptyNote icon={HandCoins}>{t('sell.notBuying')}</EmptyNote>
  // Loose dm/shop units only: player-made items never mint gold (ADR 014).
  const owned = [...sellableUnits(stacks)]
    .map(([definitionId, available]) => ({ definition: definitions.get(definitionId), available }))
    .filter((row): row is { definition: ItemDefinition; available: number } => !!row.definition)
  // Items the shop pays nothing for are named, never offered as a zero-gold sale.
  const rows = owned.filter(({ definition }) => (shop.buyback[definition.id] ?? 0) > 0)
  const worthless = owned.filter(({ definition }) => (shop.buyback[definition.id] ?? 0) === 0)
  const chosen = rows
    .map(({ definition }) => ({
      definitionId: definition.id,
      quantity: amounts[definition.id] ?? 0,
      offeredPrice: null,
    }))
    .filter((line) => line.quantity > 0)
  const total =
    chosen.reduce(
      (sum, line) => sum + toCents(shop.buyback[line.definitionId] ?? 0) * line.quantity,
      0,
    ) / 100
  const nameOf = (definition: ItemDefinition) => localizedName(definition, i18n.language)
  if (rows.length === 0)
    return (
      <EmptyNote icon={HandCoins}>
        {t(owned.length === 0 ? 'sell.nothing' : 'sell.nothingWorth')}
      </EmptyNote>
    )
  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {t('sell.help', { percent: shop.resale_percent })}
        {shop.mode === 'approval' && ` ${t('sell.approvalNote')}`}
      </Text>
      {!shop.is_open && (
        <Text size="sm" className="shop-closed-note">
          {t('shop.closedHelp')}
        </Text>
      )}
      <Stack gap="xs">
        {rows.map(({ definition, available }) => (
          <div className="sell-row" key={definition.id}>
            <ItemGlyph
              imagePath={definition.image_path}
              icon={definition.icon}
              category={definition.category}
              basicKey={definition.basic_key}
              rarity={definition.rarity}
              viewable
              name={nameOf(definition)}
            />
            <div className="sell-row-body">
              <Text fw={600} className="user-copy">
                {nameOf(definition)}
              </Text>
              <Text size="xs" c="dimmed">
                {t('sell.offerEach', {
                  value: gp(shop.buyback[definition.id] ?? 0),
                  count: available,
                })}
              </Text>
            </div>
            <div className="sell-row-amount">
              <Stepper
                hideLabel
                label={t('sell.quantityNamed', { name: nameOf(definition) })}
                min={0}
                max={available}
                required
                longPress
                value={amounts[definition.id] ?? 0}
                disabled={readOnly || !shop.is_open}
                maxMessage={t('sell.onlyHave', { count: available })}
                onChange={(value) =>
                  setAmounts((prior) => ({ ...prior, [definition.id]: value ?? 0 }))
                }
              />
              {available > 1 && (
                <UnstyledButton
                  className="quiet-link sell-all"
                  disabled={readOnly || !shop.is_open}
                  onClick={() => setAmounts((prior) => ({ ...prior, [definition.id]: available }))}
                >
                  {t('sell.all', { count: available })}
                </UnstyledButton>
              )}
            </div>
          </div>
        ))}
      </Stack>
      {worthless.length > 0 && (
        <Text size="sm" c="dimmed" className="user-copy">
          {t('sell.notBought', {
            names: worthless.map(({ definition }) => nameOf(definition)).join(', '),
          })}
        </Text>
      )}
      {shop.mode === 'approval' && (
        <Textarea
          label={t('cart.noteLabel')}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          disabled={readOnly}
        />
      )}
      <Group justify="space-between" aria-live="polite">
        <Text fw={600}>{t('sell.youReceive')}</Text>
        <GoldAmount value={total} size="lg" />
      </Group>
      <Button
        size="lg"
        disabled={readOnly || chosen.length === 0 || total === 0 || !shop.is_open}
        loading={busy}
        onClick={() => {
          onSell(chosen, note)
          setAmounts({})
          setNote('')
        }}
      >
        {shop.mode === 'approval' ? t('sell.request') : t('sell.sellFor', { value: gp(total) })}
      </Button>
    </Stack>
  )
}
