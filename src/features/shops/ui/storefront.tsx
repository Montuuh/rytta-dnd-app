import { useRef, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Chip,
  Group,
  NumberInput,
  Paper,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Handshake, Lock, Search, ShoppingBag, Zap } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { QueryFeedback, useCampaign, useCampaignView } from '@/features/campaigns'
import {
  itemCategories,
  type ItemCategory,
  type ItemDefinition,
  type ItemStack,
} from '@/features/inventory'
import { ordersQuery, storefrontQuery, useHoldings, useShopAction, useShopCharacter } from '../api'
import {
  cartTotal,
  filterListings,
  isOpenOrder,
  ownership,
  reconcileCart,
  sellableUnits,
  ShopError,
  type SaleLine,
  type CartLine,
  type OrderResult,
  type ShopAction,
  type StorefrontShop,
} from '../domain/shops'
import { CartDrawer } from './cart-drawer'
import { ListingCard, ListingDrawer } from './listing-card'
import { OrderCard } from './orders'
import { GoldAmount, ItemGlyph } from './visuals'

type Notice = { text: string; inventoryLink?: boolean }

export function Storefront() {
  const { t } = useTranslation()
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
  const orders = useQuery({
    ...ordersQuery(userId, campaign.id, character?.id ?? null),
    enabled: !!character,
  })
  const holdings = useHoldings(character?.id)
  const action = useShopAction(campaign.id)
  const [params, setParams] = useSearchParams()
  const [carts, setCarts] = useState<Record<string, CartLine[]>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
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
  const lines = shop ? reconcileCart(carts[shop.id] ?? [], shop.listings) : []
  const units = lines.reduce((sum, line) => sum + line.quantity, 0)
  const openOrders = (orders.data ?? []).filter(isOpenOrder)
  const tab = params.get('tab') ?? 'buy'

  const setParam = (key: string, value: string) =>
    setParams(
      (prior) => {
        const next = new URLSearchParams(prior)
        next.set(key, value)
        return next
      },
      { replace: true },
    )
  const setLines = (next: CartLine[]) =>
    shop && setCarts((prior) => ({ ...prior, [shop.id]: next }))
  const add = (listingId: string, quantity: number) => {
    const current = lines.find((line) => line.listingId === listingId)
    setLines(
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
  const checkout = () => {
    if (!shop || !character) return
    perform(
      {
        kind: 'checkout',
        shopId: shop.id,
        characterId: character.id,
        lines,
        note: notes[shop.id] ?? '',
        requestId: crypto.randomUUID(),
      },
      (result) => {
        setLines([])
        setNotes((prior) => ({ ...prior, [shop.id]: '' }))
        setCartOpen(false)
        setNotice(
          result?.status === 'completed'
            ? { text: t('shop.notice.bought', { value: result.total }), inventoryLink: true }
            : { text: t('shop.notice.requested', { shop: shop.name }) },
        )
      },
    )
  }
  const detail = shop?.listings.find((l) => l.id === detailId) ?? null

  return (
    <Stack gap="lg" className="storefront">
      <Group justify="space-between" align="end">
        <div>
          <Title order={1}>{t('shop.title')}</Title>
          <Text c="dimmed" mt="sm">
            {t('shop.intro')}
          </Text>
          {playerPreview && previewLabel && (
            <Text c="dimmed" mt="xs">
              {t('shop.previewReadOnly', { name: previewLabel })}
            </Text>
          )}
        </div>
      </Group>
      <QueryFeedback
        pending={acting.characters.isPending || (!!character && front.isPending)}
        error={acting.characters.isError || front.isError}
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
          <div className="purse-bar">
            <div>
              <Text size="xs" c="dimmed">
                {t('shop.purseOf', { name: character?.name ?? '' })}
              </Text>
              <GoldAmount value={gold} size="lg" />
            </div>
            {canBuy && !(units > 0 && tab === 'buy') && (
              <Button
                leftSection={<ShoppingBag size={18} aria-hidden="true" />}
                variant={units > 0 ? 'filled' : 'light'}
                onClick={() => setCartOpen(true)}
                aria-label={t('cart.openNamed', {
                  count: units,
                  value: cartTotal(lines, shop.listings, shop.mode),
                })}
              >
                {units > 0
                  ? t('cart.button', {
                      count: units,
                      value: cartTotal(lines, shop.listings, shop.mode),
                    })
                  : t('cart.buttonEmpty')}
              </Button>
            )}
          </div>
          {shops.length > 1 && (
            <nav aria-label={t('shop.list')} className="shop-switcher">
              {shops.map((s) => (
                <Button
                  key={s.id}
                  variant={s.id === shop.id ? 'filled' : 'default'}
                  aria-current={s.id === shop.id ? 'page' : undefined}
                  onClick={() => {
                    setParam('shop', s.id)
                    setSearch('')
                    setKind('all')
                  }}
                  leftSection={s.is_open ? null : <Lock size={14} aria-hidden="true" />}
                >
                  <span className="user-copy">{s.name}</span>
                </Button>
              ))}
            </nav>
          )}
          <ShopHeader shop={shop} />
          {notice && (
            <Alert
              role="status"
              withCloseButton
              onClose={() => setNotice(null)}
              closeButtonLabel={t('common.close')}
            >
              {notice.text}{' '}
              {notice.inventoryLink && (
                <Link to={`/campaign/${campaign.id}/inventory`}>
                  {t('shop.notice.seeInventory')}
                </Link>
              )}
            </Alert>
          )}
          {action.error && (
            <Alert color="red" role="alert">
              {t(
                `commerce.error.${action.error instanceof ShopError ? action.error.code : 'unavailable'}`,
              )}
            </Alert>
          )}
          <Tabs
            value={tab}
            onChange={(value) => setParam('tab', value ?? 'buy')}
            keepMounted={false}
          >
            <Tabs.List>
              <Tabs.Tab value="buy">{t('shop.tab.buy')}</Tabs.Tab>
              <Tabs.Tab value="sell">{t('shop.tab.sell')}</Tabs.Tab>
              <Tabs.Tab
                value="orders"
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
                <TextInput
                  label={t('shop.search')}
                  leftSection={<Search size={16} aria-hidden="true" />}
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                />
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
                    {itemCategories
                      .filter((k) => shop.listings.some((l) => l.item.category === k))
                      .map((k) => (
                        <Chip key={k} value={k}>
                          {t(`inventory.category.${k}`)}
                        </Chip>
                      ))}
                  </Group>
                </Chip.Group>
                {shop.listings.length === 0 ? (
                  <Text c="dimmed">{t('shop.noListings')}</Text>
                ) : (
                  <div className="listing-grid">
                    {filterListings(shop.listings, search, kind).map((listing) => (
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
                      />
                    ))}
                  </div>
                )}
                {filterListings(shop.listings, search, kind).length === 0 &&
                  shop.listings.length > 0 && <Text c="dimmed">{t('shop.noMatches')}</Text>}
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
                      requestId: crypto.randomUUID(),
                    },
                    (result) =>
                      setNotice(
                        result?.status === 'completed'
                          ? { text: t('shop.notice.sold', { value: result.total }) }
                          : { text: t('shop.notice.saleRequested', { shop: shop.name }) },
                      ),
                  )
                }
              />
            </Tabs.Panel>
            <Tabs.Panel value="orders" pt="md">
              <QueryFeedback
                pending={orders.isPending}
                error={orders.isError}
                retry={() => void orders.refetch()}
              />
              {orders.data?.length === 0 && <Text c="dimmed">{t('order.emptyPlayer')}</Text>}
              <Stack gap="sm">
                {orders.data?.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    role={playerPreview ? 'viewer' : 'player'}
                    busy={action.isPending}
                    onAction={(next) =>
                      perform(
                        next,
                        (result) =>
                          result &&
                          setNotice({
                            text: t(`order.notice.${result.status}`, { value: result.total }),
                          }),
                      )
                    }
                  />
                ))}
              </Stack>
            </Tabs.Panel>
          </Tabs>
          {canBuy && units > 0 && tab === 'buy' && (
            <div className="cart-dock">
              <Button
                fullWidth
                size="lg"
                leftSection={<ShoppingBag size={18} aria-hidden="true" />}
                onClick={() => setCartOpen(true)}
              >
                {t('cart.review', {
                  count: units,
                  value: cartTotal(lines, shop.listings, shop.mode),
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
            shop={shop}
            lines={lines}
            note={notes[shop.id] ?? ''}
            gold={gold}
            tenths={holdings.tenths}
            strength={holdings.strength}
            busy={action.isPending}
            onClose={() => setCartOpen(false)}
            onChange={setLines}
            onNote={(note) => setNotes((prior) => ({ ...prior, [shop.id]: note }))}
            onSubmit={checkout}
          />
        </>
      )}
    </Stack>
  )
}

function ShopHeader({ shop }: { shop: StorefrontShop }) {
  const { t } = useTranslation()
  return (
    <Paper p="lg" className="shop-header">
      <Stack gap="xs">
        <Title order={2} className="user-copy">
          {shop.name}
        </Title>
        {shop.description && (
          <Text c="dimmed" className="user-copy">
            {shop.description}
          </Text>
        )}
        <Group gap="xs">
          <Badge
            variant="light"
            leftSection={
              shop.mode === 'auto' ? (
                <Zap size={14} aria-hidden="true" />
              ) : (
                <Handshake size={14} aria-hidden="true" />
              )
            }
          >
            {t(`shop.mode.${shop.mode}`)}
          </Badge>
          {!shop.is_open && (
            <Badge variant="outline" leftSection={<Lock size={14} aria-hidden="true" />}>
              {t('shop.closed')}
            </Badge>
          )}
          {shop.modifier !== 0 && (
            <Badge
              variant="filled"
              className={shop.modifier < 0 ? 'modifier-discount' : 'modifier-markup'}
            >
              {shop.modifier < 0
                ? t('shop.discount', { value: -shop.modifier })
                : t('shop.markup', { value: shop.modifier })}
            </Badge>
          )}
        </Group>
        <Text size="sm" c="dimmed">
          {t(shop.mode === 'auto' ? 'shop.modeHelp.auto' : 'shop.modeHelp.approval')}
        </Text>
      </Stack>
    </Paper>
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
  const { t } = useTranslation()
  const [amounts, setAmounts] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  if (shop.resale_percent === 0) return <Text c="dimmed">{t('sell.notBuying')}</Text>
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
  const total = chosen.reduce(
    (sum, line) => sum + (shop.buyback[line.definitionId] ?? 0) * line.quantity,
    0,
  )
  if (rows.length === 0)
    return <Text c="dimmed">{t(owned.length === 0 ? 'sell.nothing' : 'sell.nothingWorth')}</Text>
  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {t('sell.help', { percent: shop.resale_percent })}
      </Text>
      <Stack gap="xs">
        {rows.map(({ definition, available }) => (
          <div className="sell-row" key={definition.id}>
            <ItemGlyph
              imagePath={definition.image_path}
              icon={definition.icon}
              rarity={definition.rarity}
            />
            <div className="sell-row-body">
              <Text fw={600} className="user-copy">
                {definition.name}
              </Text>
              <Text size="xs" c="dimmed">
                {t('sell.offerEach', {
                  value: shop.buyback[definition.id] ?? 0,
                  count: available,
                })}
              </Text>
            </div>
            <NumberInput
              hideControls
              aria-label={t('sell.quantityNamed', { name: definition.name })}
              min={0}
              max={available}
              allowDecimal={false}
              value={amounts[definition.id] ?? 0}
              disabled={readOnly}
              onChange={(value) =>
                setAmounts((prior) => ({
                  ...prior,
                  [definition.id]: Math.max(0, Math.min(available, Number(value) || 0)),
                }))
              }
              w={96}
            />
          </div>
        ))}
      </Stack>
      {worthless.length > 0 && (
        <Text size="sm" c="dimmed" className="user-copy">
          {t('sell.notBought', {
            names: worthless.map(({ definition }) => definition.name).join(', '),
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
        {shop.mode === 'approval' ? t('sell.request') : t('sell.sellFor', { value: total })}
      </Button>
    </Stack>
  )
}
