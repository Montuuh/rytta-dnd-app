import {
  ActionIcon,
  Alert,
  Title,
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
import { encumbrance, GpInput, useWeightFormat } from '@/features/inventory'
import { localizedName } from '@/shared/lib/translations'
import {
  cartPounds,
  cartTotal,
  maxPurchasable,
  sumGp,
  type CartLine,
  type StorefrontShop,
} from '../domain/shops'
import { useGp } from './use-gp'
import { GoldAmount } from './visuals'

type Props = {
  opened: boolean
  groups: { shop: StorefrontShop; lines: CartLine[]; note: string }[]
  error: string
  receipt?: string
  gold: number
  tenths: number
  strength: number | null
  busy: boolean
  onClose: () => void
  onChange: (shopId: string, lines: CartLine[]) => void
  onNote: (shopId: string, note: string) => void
  onSubmit: () => void
}

/** Checkout review: gold and load before → after, so nothing about the purchase surprises. */
export function CartDrawer(props: Props) {
  const { opened, groups, gold, tenths, strength, busy } = props
  const { t, i18n } = useTranslation()
  const gp = useGp()
  const { format: weight } = useWeightFormat()
  const phone = usePhone()
  const approval = groups.some(({ shop }) => shop.mode === 'approval')
  const immediate = groups.some(({ shop }) => shop.mode === 'auto')
  const mixed = approval && immediate
  // Totals add up in copper (sumGp), so decimal prices never drift.
  const sumMode = (mode: StorefrontShop['mode']) =>
    sumGp(
      groups
        .filter(({ shop }) => shop.mode === mode)
        .map(({ shop, lines }) => cartTotal(lines, shop.listings, mode)),
    )
  const charge = sumMode('auto')
  const requested = sumMode('approval')
  const total = sumGp([charge, requested])
  const after = sumGp([gold, -charge])
  const addedPounds = groups.reduce(
    (sum, { shop, lines }) =>
      sum + (shop.mode === 'auto' || !immediate ? cartPounds(lines, shop.listings) : 0),
    0,
  )
  const nowPounds = tenths / 10
  // The same 5e variant thresholds as the inventory Balanza (ADR 014); informative only.
  const load =
    strength === null ? null : encumbrance(Math.round((nowPounds + addedPounds) * 10), strength)
  const blocked = !groups.length || groups.some(({ shop }) => !shop.is_open) || after < 0
  return (
    <Drawer
      opened={opened}
      onClose={props.onClose}
      position={phone ? 'bottom' : 'right'}
      size={phone ? 'auto' : 'md'}
      title={t('cart.title')}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      <Stack gap="md">
        {groups.length === 0 && <Text>{t('cart.empty')}</Text>}
        {groups.map(({ shop, lines, note }) => {
          const update = (listingId: string, patch: Partial<CartLine>) =>
            props.onChange(
              shop.id,
              lines.map((line) => (line.listingId === listingId ? { ...line, ...patch } : line)),
            )
          return (
            <Stack key={shop.id} gap="xs" component="section">
              <Title order={3} size="h4" className="user-copy">
                {shop.name}
              </Title>
              {mixed && (
                <Text size="sm" c="dimmed">
                  {t(`shop.mode.${shop.mode}`)}
                </Text>
              )}
              {!shop.is_open && <Text c="dimmed">{t('shop.closedHelp')}</Text>}
              {lines.map((line) => {
                const listing = shop.listings.find((l) => l.id === line.listingId)
                if (!listing) return null
                const name = localizedName(listing.item, i18n.language)
                return (
                  <div className="cart-line" key={line.listingId}>
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <Text fw={600} className="user-copy">
                        {name}
                      </Text>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size={44}
                        disabled={busy}
                        aria-label={t('cart.removeNamed', { name })}
                        onClick={() =>
                          props.onChange(
                            shop.id,
                            lines.filter((l) => l.listingId !== line.listingId),
                          )
                        }
                      >
                        <Trash2 size={18} />
                      </ActionIcon>
                    </Group>
                    <Group align="end" gap="sm" wrap="wrap">
                      <NumberInput
                        disabled={busy}
                        hideControls
                        label={t('shop.quantity')}
                        min={1}
                        max={maxPurchasable(listing)}
                        allowDecimal={false}
                        value={line.quantity}
                        onChange={(value) =>
                          update(line.listingId, {
                            quantity: Math.max(
                              1,
                              Math.min(maxPurchasable(listing), Number(value) || 1),
                            ),
                          })
                        }
                        w={110}
                      />
                      {shop.mode === 'approval' ? (
                        <GpInput
                          disabled={busy}
                          label={t('cart.offerEach')}
                          description={t('cart.listEach', { value: gp(listing.unit_price) })}
                          placeholder={gp(listing.unit_price)}
                          value={line.offeredPrice}
                          onChange={(value) =>
                            update(line.listingId, {
                              offeredPrice: value,
                            })
                          }
                          w={150}
                        />
                      ) : (
                        <Text size="sm" c="dimmed" pb={10}>
                          {t('cart.each', { value: gp(listing.unit_price) })}
                        </Text>
                      )}
                    </Group>
                  </div>
                )
              })}
              {shop.mode === 'approval' && (
                <Textarea
                  disabled={busy}
                  label={t('cart.noteLabel')}
                  description={t('cart.noteHelp')}
                  maxLength={500}
                  value={note}
                  onChange={(event) => props.onNote(shop.id, event.currentTarget.value)}
                />
              )}
            </Stack>
          )
        })}
        {groups.length > 0 && (
          <Stack gap={8} className="cart-summary" aria-live="polite">
            <Group justify="space-between">
              <Text fw={600}>{t(approval && !mixed ? 'cart.requestTotal' : 'cart.total')}</Text>
              <GoldAmount value={total} size="lg" />
            </Group>
            {mixed && (
              <Group justify="space-between">
                <Text>{t('cart.payNow')}</Text>
                <GoldAmount value={charge} />
              </Group>
            )}
            {mixed && (
              <Group justify="space-between">
                <Text>{t('cart.awaitApproval')}</Text>
                <GoldAmount value={requested} />
              </Group>
            )}
            <Group justify="space-between" wrap="nowrap">
              <Text size="sm" c="dimmed">
                {t('cart.goldChange')}
              </Text>
              <span className={`balance-change ${after < 0 ? 'is-short' : ''}`}>
                <GoldAmount value={gold} size="sm" />
                <ArrowRight size={14} aria-label={t('cart.becomes')} />
                <GoldAmount
                  value={Math.max(0, immediate ? after : sumGp([gold, -requested]))}
                  size="sm"
                />
              </span>
            </Group>
            <Group justify="space-between" wrap="wrap" gap={4}>
              <Text size="sm" c="dimmed">
                {t('cart.loadChange')}
              </Text>
              <span className={`balance-change load-${load?.status ?? 'light'}`}>
                <Text span size="sm">
                  {weight(nowPounds)}
                </Text>
                <ArrowRight size={14} aria-label={t('cart.becomes')} />
                <Text span size="sm">
                  {load === null
                    ? weight(nowPounds + addedPounds)
                    : t(`cart.load.${load.status}`, {
                        carried: weight(load.pounds),
                        max: weight(load.thresholds.max),
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
        {after < 0 && (
          <Text role="alert" className="load-over">
            {t('cart.shortBy', { value: gp(-after) })}
          </Text>
        )}
        {approval && !mixed && (
          <Text size="sm" c="dimmed">
            {t('cart.approvalHelp')}
          </Text>
        )}
        {props.receipt && <Text role="status">{props.receipt}</Text>}
        {props.error && (
          <Alert color="red" role="alert">
            {props.error}
          </Alert>
        )}
        <Button size="lg" disabled={blocked} loading={busy} onClick={props.onSubmit}>
          {mixed
            ? t('cart.confirmMixed')
            : approval
              ? t('cart.sendRequest')
              : t('cart.buyFor', { value: gp(total) })}
        </Button>
      </Stack>
    </Drawer>
  )
}
