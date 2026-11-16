import { GlossaryText } from '@/features/glossary'
import { Anchor, Badge, Button, Drawer, Group, NumberInput, Stack, Text } from '@mantine/core'
import { usePhone } from '@/shared/ui/use-viewport'
import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useItemPicture, useWeightFormat } from '@/features/inventory'
import { localizedDescription, localizedName } from '@/shared/lib/translations'
import { itemPounds, maxPurchasable, type Listing } from '../domain/shops'
import { useGp } from './use-gp'
import { GoldAmount, ItemGlyph } from './visuals'
import './pictures.css'

type Ownership = { owned: number; equipped: number }

/** The merchant's tag: price first, then what the Player already carries. */
export function ListingCard({
  listing,
  ownership,
  inCart,
  canBuy,
  inventoryHref,
  onOpen,
  onAdd,
}: {
  listing: Listing
  ownership: Ownership
  inCart: number
  canBuy: boolean
  inventoryHref: string
  onOpen: (target: HTMLElement) => void
  onAdd: () => void
}) {
  const { t, i18n } = useTranslation()
  const gp = useGp()
  const { format: weight } = useWeightFormat()
  const name = localizedName(listing.item, i18n.language)
  const soldOut = listing.stock === 0
  const discounted = listing.unit_price !== listing.price
  const remaining = maxPurchasable(listing) - inCart
  const pictured = useItemPicture(listing.item.image_path)
  return (
    <article className={`listing-card ${soldOut ? 'is-sold-out' : ''}`}>
      {/* RYT-098: a picture is its own button beside the one that opens the item. */}
      <div className="listing-lead">
        {pictured && (
          <ItemGlyph
            imagePath={listing.item.image_path}
            icon={listing.item.icon}
            rarity={listing.item.rarity}
            viewable
            name={name}
          />
        )}
        <button
          type="button"
          className="listing-main"
          onClick={(event) => onOpen(event.currentTarget)}
        >
          {!pictured && (
            <ItemGlyph
              imagePath={listing.item.image_path}
              icon={listing.item.icon}
              rarity={listing.item.rarity}
            />
          )}
          <span className="listing-body">
            <span className="listing-name user-copy">{name}</span>
            <span className="listing-meta">
              {itemPounds(listing.item) > 0
                ? t('shop.itemMeta', {
                    rarity: t(`inventory.rarity.${listing.item.rarity}`),
                    weight: weight(itemPounds(listing.item)),
                  })
                : t(`inventory.rarity.${listing.item.rarity}`)}
            </span>
          </span>
        </button>
      </div>
      <div
        className="price-tag"
        aria-label={t('shop.priceLabel', { value: gp(listing.unit_price) })}
      >
        {discounted && (
          <span className="price-was" aria-hidden="true">
            {gp(listing.price)}
          </span>
        )}
        <GoldAmount value={listing.unit_price} />
      </div>
      <div className="listing-flags">
        {listing.exclusive && <Badge variant="outline">{t('shop.onlyForYou')}</Badge>}
        {ownership.owned > 0 && (
          <Anchor component={Link} to={inventoryHref} className="owned-link">
            {ownership.equipped > 0
              ? t('shop.ownedEquipped', { count: ownership.owned })
              : t('shop.owned', { count: ownership.owned })}
          </Anchor>
        )}
        <Text size="xs" c="dimmed" className="stock-text">
          {listing.stock === null
            ? t('shop.stockUnlimited')
            : soldOut
              ? t('shop.soldOut')
              : t('shop.stockLeft', { count: listing.stock })}
        </Text>
      </div>
      {canBuy && (
        <Button
          variant={inCart > 0 ? 'filled' : 'light'}
          leftSection={<Plus size={16} aria-hidden="true" />}
          disabled={soldOut || remaining <= 0}
          onClick={onAdd}
          aria-label={t('shop.addNamed', { name })}
          className="listing-add"
        >
          {inCart > 0 ? t('shop.inCart', { count: inCart }) : t('shop.add')}
        </Button>
      )}
    </article>
  )
}

export function ListingDrawer({
  listing,
  ownership,
  inCart,
  canBuy,
  inventoryHref,
  onClose,
  onAdd,
}: {
  listing: Listing | null
  ownership: Ownership
  inCart: number
  canBuy: boolean
  inventoryHref: string
  onClose: () => void
  onAdd: (quantity: number) => void
}) {
  const { t, i18n } = useTranslation()
  const gp = useGp()
  const { format: weight } = useWeightFormat()
  const phone = usePhone()
  const [quantity, setQuantity] = useState(1)
  const name = listing ? localizedName(listing.item, i18n.language) : ''
  const description = listing ? localizedDescription(listing.item, i18n.language) : ''
  const max = listing ? maxPurchasable(listing) - inCart : 0
  return (
    <Drawer
      opened={!!listing}
      onClose={() => {
        setQuantity(1)
        onClose()
      }}
      position={phone ? 'bottom' : 'right'}
      size={phone ? 'auto' : 'md'}
      title={listing ? <span className="user-copy">{name}</span> : ''}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      {listing && (
        <Stack>
          <Group gap="sm" wrap="nowrap">
            <ItemGlyph
              imagePath={listing.item.image_path}
              icon={listing.item.icon}
              rarity={listing.item.rarity}
              size={26}
              viewable
              name={name}
            />
            <Stack gap={0}>
              <Text fw={600}>{t(`inventory.category.${listing.item.category}`)}</Text>
              <Text size="sm" c="dimmed">
                {t(`inventory.rarity.${listing.item.rarity}`)}
              </Text>
            </Stack>
          </Group>
          {description && (
            <Text className="user-copy item-description">
              <GlossaryText text={description} />
            </Text>
          )}
          <dl className="fact-list">
            <dt>{t('shop.price')}</dt>
            <dd>
              <GoldAmount value={listing.unit_price} />
              {listing.unit_price !== listing.price && (
                <Text span size="sm" c="dimmed" ml={8}>
                  {t('shop.listPrice', { value: gp(listing.price) })}
                </Text>
              )}
            </dd>
            <dt>{t('inventory.card.weight')}</dt>
            <dd>
              {t('shop.weightEach', {
                weight: weight(itemPounds(listing.item)),
              })}
            </dd>
            <dt>{t('shop.youOwn')}</dt>
            <dd>
              {ownership.owned}{' '}
              {ownership.owned > 0 && (
                <Anchor component={Link} to={inventoryHref} className="owned-link">
                  {t('shop.seeInInventory')}
                </Anchor>
              )}
            </dd>
          </dl>
          {listing.exclusive && (
            <Group gap="xs">
              <Badge variant="outline">{t('shop.onlyForYou')}</Badge>
            </Group>
          )}
          {canBuy && max > 0 && (
            <Group align="end" wrap="nowrap">
              <NumberInput
                hideControls
                label={t('shop.quantity')}
                min={1}
                max={max}
                allowDecimal={false}
                value={quantity}
                onChange={(value) => setQuantity(Math.max(1, Math.min(max, Number(value) || 1)))}
                w={120}
              />
              <Button
                onClick={() => {
                  onAdd(quantity)
                  setQuantity(1)
                }}
              >
                {t('shop.addToCart', { count: quantity })}
              </Button>
            </Group>
          )}
          {canBuy && max <= 0 && (
            <Text size="sm" c="dimmed">
              {listing.stock === 0 ? t('shop.soldOut') : t('shop.allInCart')}
            </Text>
          )}
        </Stack>
      )}
    </Drawer>
  )
}
