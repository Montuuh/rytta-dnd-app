import { useEffect, useRef, useState } from 'react'
import {
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Stack,
  Text,
  Textarea,
  Title,
  UnstyledButton,
} from '@mantine/core'
import {
  Ban,
  CheckCircle2,
  Clock,
  Handshake,
  RotateCcw,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { HoldSeal } from '@/features/inventory'
import { GoldAmount, ItemGlyph } from './visuals'
import {
  effectiveLinePrice,
  isOpenOrder,
  type Order,
  type OrderLine,
  type OrderStatus,
  type ShopAction,
} from '../domain/shops'

const statusIcons: Record<OrderStatus, LucideIcon> = {
  pending: Clock,
  countered: Handshake,
  completed: CheckCircle2,
  rejected: XCircle,
  cancelled: Ban,
  reverted: RotateCcw,
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation()
  const Icon = statusIcons[status]
  return (
    <Badge
      variant={isOpenOrder({ status }) ? 'filled' : 'light'}
      className={`order-status status-${status}`}
      leftSection={<Icon size={14} aria-hidden="true" />}
    >
      {t(`order.status.${status}`)}
    </Badge>
  )
}

type Role = 'dm' | 'player' | 'viewer'
type Panel = 'counter' | 'revert' | null

/** Price chips for a counter-offer line: the Player's offer, the list price and the middle. */
function CounterLine({
  line,
  value,
  onChange,
}: {
  line: OrderLine
  value: number
  onChange: (value: number) => void
}) {
  const { t } = useTranslation()
  const offer = line.offered_price ?? line.unit_price
  const middle = Math.round((offer + line.unit_price) / 2)
  const options = [
    { key: 'offer', label: t('order.chip.offer', { value: offer }), price: offer },
    { key: 'middle', label: t('order.chip.middle', { value: middle }), price: middle },
    {
      key: 'list',
      label: t('order.chip.list', { value: line.unit_price }),
      price: line.unit_price,
    },
  ].filter((o, i, all) => all.findIndex((x) => x.price === o.price) === i)
  return (
    <div className="counter-line">
      <Group gap="sm" wrap="nowrap">
        <ItemGlyph icon={line.icon} rarity="common" size={18} />
        <Text fw={600} className="user-copy">
          {t('order.lineItem', { name: line.item_name, count: line.quantity })}
        </Text>
      </Group>
      <Group
        gap={6}
        mt={6}
        role="group"
        aria-label={t('order.chip.group', { name: line.item_name })}
      >
        {options.map((o) => (
          <UnstyledButton
            key={o.key}
            className="category-chip"
            aria-pressed={value === o.price}
            onClick={() => onChange(o.price)}
          >
            {o.label}
          </UnstyledButton>
        ))}
        <NumberInput
          hideControls
          aria-label={t('order.unitPriceFor', { name: line.item_name, count: line.quantity })}
          min={0}
          max={100_000_000}
          allowDecimal={false}
          value={value}
          suffix={` ${t('gold.short')}`}
          onChange={(next) => onChange(Number(next) || 0)}
          w={110}
        />
      </Group>
    </div>
  )
}

export function OrderCard({
  order,
  role,
  busy,
  onAction,
}: {
  order: Order
  role: Role
  busy: boolean
  onAction: (action: ShopAction) => void
}) {
  const { t, i18n } = useTranslation()
  const [panel, setPanelState] = useState<Panel>(null)
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  // Rejecting closes the request for good, so it takes a second, explicit tap.
  const [confirmReject, setConfirmRejectState] = useState(false)
  const rejectRef = useRef<HTMLButtonElement>(null)
  const noRef = useRef<HTMLButtonElement>(null)
  // The confirmation replaces the button that opened it: move focus to "No" (the safe
  // choice) and back to "Rechazar" when it is cancelled, so focus never drops to the body.
  const setConfirmReject = (next: boolean) => {
    setConfirmRejectState(next)
    requestAnimationFrame(() => (next ? noRef.current : rejectRef.current)?.focus())
  }
  const card = useRef<HTMLElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const last = useRef<Panel>(null)
  // Opening moves focus into the panel (its trigger is replaced by it); closing returns it
  // to the trigger again, or to the card when the order moved on and the trigger is gone.
  const setPanel = (next: Panel, toCard = false) => {
    if (next) last.current = next
    setPanelState(next)
    requestAnimationFrame(() => {
      if (next) panelRef.current?.focus()
      else
        (toCard
          ? card.current
          : (document.getElementById(`${last.current}-${order.id}`) ?? card.current)
        )?.focus()
    })
  }
  // When the order changes status its action buttons are replaced; if focus was on one of
  // them it would drop to the body, so the card takes it instead.
  const acted = useRef(false)
  useEffect(() => {
    if (acted.current && (document.activeElement === document.body || !document.activeElement))
      card.current?.focus()
    acted.current = false
  }, [order.status])
  const act = (next: ShopAction) => {
    acted.current = true
    onAction(next)
  }
  const escape = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      setPanel(null)
    }
  }
  const key = () => crypto.randomUUID()
  const settled = order.status === 'completed' || order.status === 'reverted'
  const titleKey =
    order.kind === 'purchase'
      ? settled
        ? 'order.purchaseTitle'
        : 'order.purchaseRequestTitle'
      : settled
        ? 'order.saleTitle'
        : 'order.saleRequestTitle'
  const counterPrice = (line: OrderLine) => prices[line.id] ?? line.offered_price ?? line.unit_price
  const counterTotal = order.lines.reduce((sum, l) => sum + counterPrice(l) * l.quantity, 0)
  const respond = (decision: 'approve' | 'reject') =>
    act({
      kind: 'respond',
      orderId: order.id,
      decision,
      prices: [],
      note: '',
      requestId: key(),
    })
  return (
    <Paper
      p="md"
      className={`order-card ${isOpenOrder(order) ? 'is-open' : ''}`}
      component="article"
      ref={card}
      tabIndex={-1}
      aria-labelledby={`order-${order.id}`}
    >
      <Stack gap="sm">
        <Group justify="space-between" align="start" gap="xs">
          <div className="order-heading">
            <Title order={3} size="h4" className="user-copy" id={`order-${order.id}`}>
              {t(titleKey, { character: order.character.name, shop: order.shop.name })}
            </Title>
            <Text size="xs" c="dimmed">
              {new Date(order.created_at).toLocaleString(i18n.language, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </Text>
          </div>
          <OrderStatusBadge status={order.status} />
        </Group>
        <ul className="order-lines">
          {order.lines.map((line) => (
            <li key={line.id}>
              <span className="user-copy order-line-name">
                {t('order.lineItem', { name: line.item_name, count: line.quantity })}
              </span>
              <span className="order-line-price">
                {(line.countered_price !== null || line.offered_price !== null) &&
                  line.final_price === null && (
                    <Text span size="xs" c="dimmed" mr={6}>
                      {line.countered_price !== null
                        ? t('order.counterHint', {
                            asked: line.offered_price ?? line.unit_price,
                            value: line.countered_price,
                          })
                        : t('order.offerHint', {
                            list: line.unit_price,
                            value: line.offered_price ?? line.unit_price,
                          })}
                    </Text>
                  )}
                <GoldAmount value={effectiveLinePrice(line) * line.quantity} size="sm" />
              </span>
              {line.reverted_quantity > 0 && (
                <Text size="xs" c="dimmed" className="order-line-note">
                  {t('order.revertedUnits', { count: line.reverted_quantity })}
                </Text>
              )}
            </li>
          ))}
        </ul>
        <Group justify="space-between">
          <Text fw={600}>
            {t(order.kind === 'purchase' ? 'order.totalPay' : 'order.totalReceive')}
          </Text>
          <GoldAmount value={order.total} />
        </Group>
        {order.status === 'reverted' && (
          <Text size="sm">
            {t(order.kind === 'purchase' ? 'order.refunded' : 'order.recovered', {
              value: order.refunded,
            })}
          </Text>
        )}
        {order.player_note && (
          <Text size="sm" className="user-copy order-note">
            <strong>{t('order.playerNote')}</strong> {order.player_note}
          </Text>
        )}
        {order.dm_note && (
          <Text size="sm" className="user-copy order-note">
            <strong>{t('order.dmNote')}</strong> {order.dm_note}
          </Text>
        )}

        {role === 'dm' && order.status === 'pending' && panel !== 'counter' && (
          <div className="order-actions">
            <Button
              loading={busy}
              leftSection={<CheckCircle2 size={16} aria-hidden="true" />}
              onClick={() => respond('approve')}
            >
              {t('order.approveFor', { value: order.total })}
            </Button>
            <Button
              id={`counter-${order.id}`}
              variant="light"
              leftSection={<Handshake size={16} aria-hidden="true" />}
              onClick={() => setPanel('counter')}
            >
              {t('order.counter')}
            </Button>
            {confirmReject ? (
              <Group
                gap={4}
                role="group"
                aria-label={t('order.rejectConfirm')}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation()
                    setConfirmReject(false)
                  }
                }}
              >
                <Button
                  variant="light"
                  color="red"
                  loading={busy}
                  onClick={() => {
                    acted.current = true
                    respond('reject')
                  }}
                >
                  {t('order.rejectYes')}
                </Button>
                <Button ref={noRef} variant="subtle" onClick={() => setConfirmReject(false)}>
                  {t('order.rejectNo')}
                </Button>
              </Group>
            ) : (
              <Button
                ref={rejectRef}
                variant="subtle"
                color="red"
                onClick={() => setConfirmReject(true)}
              >
                {t('order.reject')}
              </Button>
            )}
          </div>
        )}
        {panel === 'counter' && (
          <Stack
            gap="sm"
            className="inline-panel"
            ref={panelRef}
            tabIndex={-1}
            role="group"
            aria-label={t('order.counterTitle')}
            onKeyDown={escape}
          >
            <Text size="sm" c="dimmed">
              {t('order.counterHelp')}
            </Text>
            {order.lines.map((line) => (
              <CounterLine
                key={line.id}
                line={line}
                value={counterPrice(line)}
                onChange={(value) => setPrices((prior) => ({ ...prior, [line.id]: value }))}
              />
            ))}
            <Textarea
              label={t('order.noteToPlayer')}
              maxLength={500}
              autosize
              minRows={1}
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
            />
            <Group justify="space-between" aria-live="polite">
              <Text fw={600}>{t('order.newTotal')}</Text>
              <GoldAmount value={counterTotal} />
            </Group>
            <Group justify="end" gap="xs">
              <Button variant="subtle" onClick={() => setPanel(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                loading={busy}
                onClick={() => {
                  act({
                    kind: 'respond',
                    orderId: order.id,
                    decision: 'counter',
                    prices: order.lines.map((line) => ({
                      lineId: line.id,
                      price: counterPrice(line),
                    })),
                    note,
                    requestId: key(),
                  })
                  setPanel(null, true)
                }}
              >
                {t('order.sendCounterFor', { value: counterTotal })}
              </Button>
            </Group>
          </Stack>
        )}

        {role === 'dm' && order.status === 'countered' && (
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              {t('order.awaitingPlayer')}
            </Text>
            <Button variant="subtle" color="red" loading={busy} onClick={() => respond('reject')}>
              {t('order.withdraw')}
            </Button>
          </Group>
        )}

        {role === 'dm' && order.status === 'completed' && panel !== 'revert' && (
          <Group>
            <Button
              id={`revert-${order.id}`}
              variant="light"
              color="red"
              leftSection={<RotateCcw size={16} aria-hidden="true" />}
              onClick={() => setPanel('revert')}
            >
              {t('order.revert')}
            </Button>
          </Group>
        )}
        {panel === 'revert' && (
          <Stack
            gap="sm"
            className="inline-panel revert-panel"
            ref={panelRef}
            tabIndex={-1}
            role="group"
            aria-label={t('order.revertTitle')}
            onKeyDown={escape}
          >
            <Text size="sm">
              {t(order.kind === 'purchase' ? 'order.revertPurchaseHelp' : 'order.revertSaleHelp', {
                character: order.character.name,
                value: order.total,
              })}
            </Text>
            <Textarea
              label={t('order.noteToPlayer')}
              maxLength={500}
              autosize
              minRows={1}
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
            />
            <Group justify="space-between" align="center" wrap="wrap">
              <Button variant="subtle" onClick={() => setPanel(null)}>
                {t('common.cancel')}
              </Button>
              <HoldSeal
                label={t('order.revertSeal', { value: order.total })}
                hint={t('order.revertHint')}
                confirmLabel={t('order.revertNow')}
                disabled={busy}
                onConfirm={() => {
                  act({ kind: 'revert', orderId: order.id, note, requestId: key() })
                  setPanel(null)
                }}
              >
                <RotateCcw size={22} aria-hidden="true" />
              </HoldSeal>
            </Group>
          </Stack>
        )}

        {role === 'player' && order.status === 'pending' && (
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              {t('order.awaitingDm')}
            </Text>
            <Button
              variant="subtle"
              color="red"
              loading={busy}
              onClick={() => act({ kind: 'cancel', orderId: order.id })}
            >
              {t('order.cancel')}
            </Button>
          </Group>
        )}
        {role === 'player' && order.status === 'countered' && (
          <Group gap="xs">
            <Button
              loading={busy}
              onClick={() =>
                act({ kind: 'answer', orderId: order.id, accept: true, requestId: key() })
              }
            >
              {t('order.acceptFor', { value: order.total })}
            </Button>
            <Button
              variant="subtle"
              color="red"
              loading={busy}
              onClick={() =>
                act({ kind: 'answer', orderId: order.id, accept: false, requestId: key() })
              }
            >
              {t('order.decline')}
            </Button>
          </Group>
        )}
      </Stack>
    </Paper>
  )
}
