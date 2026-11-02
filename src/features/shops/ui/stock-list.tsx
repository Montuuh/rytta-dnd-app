import { useState } from 'react'
import {
  ActionIcon,
  Badge,
  Button,
  Collapse,
  Drawer,
  Group,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import {
  Check,
  ChevronDown,
  EyeOff,
  Hammer,
  Minus,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useLongPress } from '@/shared/ui/use-long-press'
import { itemCategories, type ItemCategory } from '@/features/inventory'
import type {
  AdminItem,
  AdminListing,
  AdminShop,
  ListingDraft,
  ListingVisibility,
  ShopAdmin,
} from '../domain/shops'
import { AccessChips } from './shop-controls'
import { GoldAmount, ItemGlyph } from './visuals'

/** − / + with a hold for ×10, the same stepper feel as Party resources (ADR 015). */
function Stepper({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  suffix?: string
  onChange: (value: number) => void
}) {
  const { t } = useTranslation()
  const clamp = (next: number) => Math.max(min, Math.min(max, next))
  const down = useLongPress(
    () => onChange(clamp(value - 1)),
    () => onChange(clamp(value - 10)),
  )
  const up = useLongPress(
    () => onChange(clamp(value + 1)),
    () => onChange(clamp(value + 10)),
  )
  return (
    <div className="stock-stepper">
      <Text size="sm" fw={500} mb={4}>
        {label}
      </Text>
      <Group gap={6} wrap="nowrap">
        <ActionIcon
          variant="light"
          size={44}
          aria-label={t('admin.stepper.down', { label })}
          disabled={value <= min}
          {...down}
        >
          <Minus size={18} />
        </ActionIcon>
        <NumberInput
          hideControls
          aria-label={label}
          min={min}
          max={max}
          allowDecimal={false}
          value={value}
          suffix={suffix}
          onChange={(next) => onChange(clamp(Number(next) || 0))}
          w={110}
          classNames={{ input: 'stepper-input' }}
        />
        <ActionIcon
          variant="light"
          size={44}
          aria-label={t('admin.stepper.up', { label })}
          disabled={value >= max}
          {...up}
        >
          <Plus size={18} />
        </ActionIcon>
      </Group>
      <Text size="xs" c="dimmed" mt={4}>
        {t('admin.stepper.hint')}
      </Text>
    </div>
  )
}

function ListingRow({
  shop,
  listing,
  item,
  characters,
  expanded,
  busy,
  onToggle,
  onSave,
  onRemove,
}: {
  shop: AdminShop
  listing: AdminListing
  item: AdminItem
  characters: ShopAdmin['characters']
  expanded: boolean
  busy: boolean
  onToggle: () => void
  onSave: (draft: ListingDraft) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const initial: ListingDraft = {
    definition_id: listing.definition_id,
    price: listing.price,
    stock: listing.stock,
    visibility: listing.visibility,
    access: listing.access,
  }
  const [draft, setDraft] = useState(initial)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const panelId = `listing-panel-${listing.id}`
  const names = listing.access
    .map((id) => characters.find((c) => c.id === id)?.name)
    .filter(Boolean)
    .join(', ')
  return (
    <li className={`stock-row ${expanded ? 'is-expanded' : ''}`}>
      <UnstyledButton
        id={`listing-main-${listing.id}`}
        className="stock-row-main"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => {
          // Unsaved edits survive collapsing (the row says so); a clean editor reopens
          // from the server row so it never shows stale values.
          if (!expanded && !dirty) setDraft(initial)
          onToggle()
        }}
      >
        <ItemGlyph icon={item.icon} rarity={item.rarity} />
        <span className="stock-row-body">
          <span className="stock-row-name user-copy">{item.name}</span>
          <span className="stock-row-meta">
            {listing.stock === null
              ? t('shop.stockUnlimited')
              : listing.stock === 0
                ? t('shop.soldOut')
                : t('admin.listing.stockCount', { count: listing.stock })}
          </span>
          {dirty && !expanded && (
            <Badge variant="filled" size="sm" className="unsaved-badge">
              {t('admin.listing.unsaved')}
            </Badge>
          )}
          {listing.visibility !== 'shop' && (
            <Badge
              variant="outline"
              size="sm"
              leftSection={
                listing.visibility === 'hidden' ? (
                  <EyeOff size={12} aria-hidden="true" />
                ) : (
                  <Users size={12} aria-hidden="true" />
                )
              }
            >
              {listing.visibility === 'hidden'
                ? t('admin.visibility.listing.hidden')
                : t('admin.visibility.onlyFor', { names: names || '—' })}
            </Badge>
          )}
        </span>
        <GoldAmount value={listing.price} size="sm" />
        <ChevronDown size={18} aria-hidden="true" className="stock-row-chevron" />
      </UnstyledButton>
      <Collapse expanded={expanded} id={panelId}>
        {expanded && (
          <Stack gap="md" className="stock-row-editor">
            <Group align="start" gap="xl" wrap="wrap">
              <Stepper
                label={t('shop.price')}
                value={draft.price}
                min={0}
                max={100_000_000}
                suffix={` ${t('gold.short')}`}
                onChange={(price) => setDraft({ ...draft, price })}
              />
              <div className="price-quick">
                <Text size="sm" fw={500} mb={4}>
                  {t('admin.listing.quickPrice')}
                </Text>
                <Group gap={6}>
                  {item.value_gp !== null && (
                    <Button
                      variant="default"
                      onClick={() => setDraft({ ...draft, price: item.value_gp ?? 0 })}
                    >
                      {t('admin.listing.useValue', { value: item.value_gp })}
                    </Button>
                  )}
                  {[-10, 10, 25].map((pct) => (
                    <Button
                      key={pct}
                      variant="default"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          price: Math.max(0, Math.round((draft.price * (100 + pct)) / 100)),
                        })
                      }
                    >
                      {pct > 0 ? `+${pct}%` : `${pct}%`}
                    </Button>
                  ))}
                </Group>
              </div>
            </Group>
            <div>
              <Text size="sm" fw={500} mb={6} id={`stock-mode-${listing.id}`}>
                {t('admin.listing.stockMode')}
              </Text>
              <SegmentedControl
                aria-labelledby={`stock-mode-${listing.id}`}
                value={draft.stock === null ? 'unlimited' : 'limited'}
                onChange={(mode) =>
                  setDraft({ ...draft, stock: mode === 'unlimited' ? null : (listing.stock ?? 1) })
                }
                data={[
                  { value: 'unlimited', label: t('admin.listing.unlimited') },
                  { value: 'limited', label: t('admin.listing.limited') },
                ]}
              />
              {draft.stock !== null && (
                <div className="controls-indent">
                  <Stepper
                    label={t('admin.listing.stock')}
                    value={draft.stock}
                    min={0}
                    max={9999}
                    onChange={(stock) => setDraft({ ...draft, stock })}
                  />
                </div>
              )}
            </div>
            <div>
              <Text size="sm" fw={500} mb={6} id={`listing-vis-${listing.id}`}>
                {t('admin.listing.visibility')}
              </Text>
              <SegmentedControl
                fullWidth
                aria-labelledby={`listing-vis-${listing.id}`}
                value={draft.visibility}
                onChange={(visibility) =>
                  setDraft({ ...draft, visibility: visibility as ListingVisibility })
                }
                data={(['shop', 'hidden', 'selected'] as const).map((v) => ({
                  value: v,
                  label: t(`admin.visibility.listing.${v}`),
                }))}
                className="wrap-segments"
              />
              {draft.visibility === 'selected' && (
                <div className="controls-indent">
                  <AccessChips
                    label={t('admin.listing.access')}
                    characters={characters}
                    value={draft.access}
                    onChange={(access) => setDraft({ ...draft, access })}
                  />
                </div>
              )}
              {shop.visibility === 'hidden' && draft.visibility !== 'hidden' && (
                <Text size="xs" c="dimmed" mt={4}>
                  {t('admin.listing.shopHidden')}
                </Text>
              )}
            </div>
            <Group justify="space-between">
              <Button
                variant="subtle"
                color="red"
                leftSection={<Trash2 size={16} aria-hidden="true" />}
                onClick={onRemove}
              >
                {t('admin.archive.listingConfirm')}
              </Button>
              <Group gap="xs">
                <Button variant="subtle" disabled={!dirty} onClick={() => setDraft(initial)}>
                  {t('admin.listing.discard')}
                </Button>
                <Button
                  loading={busy}
                  disabled={
                    !dirty || (draft.visibility === 'selected' && draft.access.length === 0)
                  }
                  onClick={() => onSave(draft)}
                >
                  {t('admin.listing.saveChanges')}
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Collapse>
    </li>
  )
}

export function StockList({
  shop,
  data,
  busy,
  onAdd,
  onSave,
  onRemove,
}: {
  shop: AdminShop
  data: ShopAdmin
  busy: boolean
  onAdd: () => void
  onSave: (listing: AdminListing, draft: ListingDraft, name: string, done: () => void) => void
  onRemove: (listing: AdminListing, name: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<string | null>(null)
  return (
    <section aria-labelledby={`stock-${shop.id}`}>
      <Group justify="space-between" mt="lg" mb="sm">
        <Title order={3} id={`stock-${shop.id}`}>
          {t('admin.listing.title')}
        </Title>
        <Button leftSection={<Plus size={16} aria-hidden="true" />} onClick={onAdd}>
          {t('admin.listing.new')}
        </Button>
      </Group>
      {shop.listings.length === 0 ? (
        <Text c="dimmed">{t('admin.listing.empty')}</Text>
      ) : (
        <ul className="stock-list">
          {shop.listings.map((listing) => {
            const item = data.items.find((i) => i.id === listing.definition_id)
            if (!item) return null
            return (
              <ListingRow
                key={listing.id}
                shop={shop}
                listing={listing}
                item={item}
                characters={data.characters}
                expanded={open === listing.id}
                busy={busy}
                onToggle={() => setOpen(open === listing.id ? null : listing.id)}
                onSave={(draft) =>
                  onSave(listing, draft, item.name, () => {
                    setOpen(null)
                    requestAnimationFrame(() =>
                      document.getElementById(`listing-main-${listing.id}`)?.focus(),
                    )
                  })
                }
                onRemove={() => onRemove(listing, item.name)}
              />
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Pick several catalog items at once from an icon grid; each lands at its DM value. */
export function AddItemsDrawer({
  opened,
  shop,
  items,
  forgeHref,
  busy,
  onClose,
  onAdd,
}: {
  opened: boolean
  shop: AdminShop
  items: AdminItem[]
  forgeHref: string
  busy: boolean
  onClose: () => void
  onAdd: (items: AdminItem[]) => void
}) {
  const { t } = useTranslation()
  const phone = useMediaQuery('(max-width: 48em)')
  const [picked, setPicked] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<ItemCategory | 'all'>('all')
  const taken = new Set(shop.listings.map((l) => l.definition_id))
  const available = items.filter((i) => !taken.has(i.id))
  const needle = search.trim().toLocaleLowerCase()
  const visible = available.filter(
    (i) =>
      (category === 'all' || i.category === category) &&
      (!needle || i.name.toLocaleLowerCase().includes(needle)),
  )
  const close = () => {
    setPicked([])
    setSearch('')
    onClose()
  }
  return (
    <Drawer
      opened={opened}
      onClose={close}
      position={phone ? 'bottom' : 'right'}
      size={phone ? '92%' : 'lg'}
      title={t('admin.listing.pickTitle', { shop: shop.name })}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      <Stack gap="md">
        {available.length === 0 ? (
          <Text>{t('admin.listing.noItems')}</Text>
        ) : (
          <>
            <TextInput
              label={t('admin.listing.pickSearch')}
              leftSection={<Search size={16} aria-hidden="true" />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              data-autofocus
            />
            <div className="kind-filter" role="group" aria-label={t('shop.filterKind')}>
              {(['all', ...itemCategories] as const)
                .filter((c) => c === 'all' || available.some((i) => i.category === c))
                .map((c) => (
                  <UnstyledButton
                    key={c}
                    className="category-chip"
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                  >
                    {t(`inventory.category.${c}`)}
                  </UnstyledButton>
                ))}
            </div>
            <div className="pick-grid" role="group" aria-label={t('admin.listing.pickGroup')}>
              {visible.map((item) => {
                const on = picked.includes(item.id)
                return (
                  <UnstyledButton
                    key={item.id}
                    className="pick-tile"
                    aria-pressed={on}
                    onClick={() =>
                      setPicked(on ? picked.filter((id) => id !== item.id) : [...picked, item.id])
                    }
                  >
                    <ItemGlyph icon={item.icon} rarity={item.rarity} size={24} />
                    <span className="pick-tile-name user-copy">{item.name}</span>
                    <span className="pick-tile-value">
                      {item.value_gp === null
                        ? t('admin.listing.noValueShort')
                        : t('gold.amount', { value: item.value_gp })}
                    </span>
                    {on && (
                      <span className="pick-tile-check" aria-hidden="true">
                        <Check size={16} />
                      </span>
                    )}
                  </UnstyledButton>
                )
              })}
            </div>
            {visible.length === 0 && <Text c="dimmed">{t('shop.noMatches')}</Text>}
          </>
        )}
        <Button
          component={Link}
          to={forgeHref}
          variant="subtle"
          leftSection={<Hammer size={16} aria-hidden="true" />}
          w="fit-content"
        >
          {t('admin.listing.toForge')}
        </Button>
        <div className="pick-dock">
          <Button
            size="lg"
            fullWidth
            disabled={picked.length === 0}
            loading={busy}
            onClick={() => {
              onAdd(available.filter((i) => picked.includes(i.id)))
              setPicked([])
            }}
          >
            {picked.length === 0
              ? t('admin.listing.pickNone')
              : t('admin.listing.pickAdd', { count: picked.length })}
          </Button>
          <Text size="xs" c="dimmed" ta="center" mt={4}>
            {t('admin.listing.pickHelp')}
          </Text>
        </div>
      </Stack>
    </Drawer>
  )
}
