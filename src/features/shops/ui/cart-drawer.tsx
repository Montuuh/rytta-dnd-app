import {
  ActionIcon,
  Button,
  Drawer,
  Group,
  NumberInput,
  Stack,
  Text,
  Textarea,
} from '@mantine/core'
import { usePhone } from '@/shared/ui/use-viewport'
import { ArrowRight, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { encumbrance, formatPounds } from '@/features/inventory'
import {
  cartTotal,
  cartTenths,
  maxPurchasable,
  type CartLine,
  type StorefrontShop,
} from '../domain/shops'
import { GoldAmount } from './visuals'

type Props = {
  opened: boolean
  shop: StorefrontShop
  lines: CartLine[]
  note: string
  gold: number
  tenths: number
  strength: number | null
  busy: boolean
  onClose: () => void
  onChange: (lines: CartLine[]) => void
  onNote: (note: string) => void
  onSubmit: () => void
}

/** Checkout review: gold and load before → after, so nothing about the purchase surprises. */
export function CartDrawer(props: Props) {
  const { opened, shop, lines, note, gold, tenths, strength, busy } = props
  const { t, i18n } = useTranslation()
  const phone = usePhone()
  const approval = shop.mode === 'approval'
  const total = cartTotal(lines, shop.listings, shop.mode)
  const after = gold - total
  const addedTenths = cartTenths(lines, shop.listings)
  // The same 5e variant thresholds as the inventory Balanza (ADR 014); informative only.
  const load = strength === null ? null : encumbrance(tenths + addedTenths, strength)
  const update = (listingId: string, patch: Partial<CartLine>) =>
    props.onChange(
      lines.map((line) => (line.listingId === listingId ? { ...line, ...patch } : line)),
    )
  const blocked = lines.length === 0 || !shop.is_open || (!approval && after < 0)
  return (
    <Drawer
      opened={opened}
      onClose={props.onClose}
      position={phone ? 'bottom' : 'right'}
      size={phone ? '90%' : 'md'}
      title={t('cart.title', { shop: shop.name })}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      <Stack gap="md">
        {lines.length === 0 && <Text>{t('cart.empty')}</Text>}
        {lines.map((line) => {
          const listing = shop.listings.find((l) => l.id === line.listingId)
          if (!listing) return null
          return (
            <div className="cart-line" key={line.listingId}>
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text fw={600} className="user-copy">
                  {listing.item.name}
                </Text>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size={44}
                  aria-label={t('cart.removeNamed', { name: listing.item.name })}
                  onClick={() =>
                    props.onChange(lines.filter((l) => l.listingId !== line.listingId))
                  }
                >
                  <Trash2 size={18} />
                </ActionIcon>
              </Group>
              <Group align="end" gap="sm" wrap="wrap">
                <NumberInput
                  hideControls
                  label={t('shop.quantity')}
                  min={1}
                  max={maxPurchasable(listing)}
                  allowDecimal={false}
                  value={line.quantity}
                  onChange={(value) =>
                    update(line.listingId, {
                      quantity: Math.max(1, Math.min(maxPurchasable(listing), Number(value) || 1)),
                    })
                  }
                  w={110}
                />
                {approval ? (
                  <NumberInput
                    hideControls
                    label={t('cart.offerEach')}
                    description={t('cart.listEach', { value: listing.unit_price })}
                    placeholder={String(listing.unit_price)}
                    min={0}
                    max={1_000_000_000}
                    allowDecimal={false}
                    value={line.offeredPrice ?? ''}
                    onChange={(value) =>
                      update(line.listingId, { offeredPrice: value === '' ? null : Number(value) })
                    }
                    w={150}
                  />
                ) : (
                  <Text size="sm" c="dimmed" pb={10}>
                    {t('cart.each', { value: listing.unit_price })}
                  </Text>
                )}
              </Group>
            </div>
          )
        })}
        {approval && lines.length > 0 && (
          <Textarea
            label={t('cart.noteLabel')}
            description={t('cart.noteHelp')}
            maxLength={500}
            value={note}
            onChange={(event) => props.onNote(event.currentTarget.value)}
          />
        )}
        {lines.length > 0 && (
          <Stack gap={8} className="cart-summary" aria-live="polite">
            <Group justify="space-between">
              <Text fw={600}>{t(approval ? 'cart.requestTotal' : 'cart.total')}</Text>
              <GoldAmount value={total} size="lg" />
            </Group>
            <Group justify="space-between" wrap="nowrap">
              <Text size="sm" c="dimmed">
                {t('cart.goldChange')}
              </Text>
              <span className={`balance-change ${after < 0 ? 'is-short' : ''}`}>
                <GoldAmount value={gold} size="sm" />
                <ArrowRight size={14} aria-label={t('cart.becomes')} />
                <GoldAmount value={Math.max(0, after)} size="sm" />
              </span>
            </Group>
            <Group justify="space-between" wrap="wrap" gap={4}>
              <Text size="sm" c="dimmed">
                {t('cart.loadChange')}
              </Text>
              <span className={`balance-change load-${load?.status ?? 'light'}`}>
                <Text span size="sm">
                  {t('cart.weightNow', { weight: formatPounds(tenths / 10, i18n.language) })}
                </Text>
                <ArrowRight size={14} aria-label={t('cart.becomes')} />
                <Text span size="sm">
                  {load === null
                    ? t('cart.weightNow', {
                        weight: formatPounds((tenths + addedTenths) / 10, i18n.language),
                      })
                    : t(`inventory.load.${load.status}`, {
                        carried: formatPounds(load.pounds, i18n.language),
                        max: formatPounds(load.thresholds.max, i18n.language),
                        penalty: load.speedPenalty,
                      })}
                </Text>
              </span>
            </Group>
            {load?.status === 'over' && (
              <Text size="sm" className="load-over">
                {t('cart.overloadWarning')}
              </Text>
            )}
          </Stack>
        )}
        {!shop.is_open && <Text c="dimmed">{t('shop.closedHelp')}</Text>}
        {!approval && after < 0 && lines.length > 0 && (
          <Text role="alert" className="load-over">
            {t('cart.shortBy', { value: -after })}
          </Text>
        )}
        {approval && lines.length > 0 && (
          <Text size="sm" c="dimmed">
            {t('cart.approvalHelp')}
          </Text>
        )}
        <Button size="lg" disabled={blocked} loading={busy} onClick={props.onSubmit}>
          {approval ? t('cart.sendRequest') : t('cart.buyFor', { value: total })}
        </Button>
      </Stack>
    </Drawer>
  )
}
