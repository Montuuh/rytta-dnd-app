import { useState } from 'react'
import { Chip, Group, SegmentedControl, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { QueryFeedback, useCampaign } from '@/features/campaigns'
import { ordersQuery } from '../api'
import { isOpenOrder, type ShopAction, type ShopAdmin } from '../domain/shops'
import { OrderCard } from './orders'

type View = 'needs' | 'awaiting' | 'history'

/**
 * The DM's order book: what needs an answer, what waits on a Player, and the history with
 * revert. Views are a segmented control with live counts; people and shops are chips.
 */
export function Ledger({
  data,
  busy,
  onAction,
}: {
  data: ShopAdmin
  busy: boolean
  onAction: (action: ShopAction) => void
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const campaign = useCampaign()
  const orders = useQuery(ordersQuery(state.user!.id, campaign.id, null))
  const [character, setCharacter] = useState('all')
  const [shop, setShop] = useState('all')
  const filtered = (orders.data ?? []).filter(
    (o) =>
      (character === 'all' || o.character.id === character) &&
      (shop === 'all' || o.shop.id === shop),
  )
  const groups = {
    needs: filtered.filter((o) => o.status === 'pending'),
    awaiting: filtered.filter((o) => o.status === 'countered'),
    history: filtered.filter((o) => !isOpenOrder(o)),
  }
  const [chosen, setChosen] = useState<View | null>(null)
  // Orders the DM just acted on stay in the current view (showing their new status) until
  // the view changes, so the card and the focus inside it never vanish mid-task.
  const [kept, setKept] = useState<string[]>([])
  const setView = (next: View) => {
    setKept([])
    setChosen(next)
  }
  // Open on what needs the DM; fall back to history when nothing waits.
  const view: View =
    chosen ??
    (groups.needs.length > 0 ? 'needs' : groups.awaiting.length > 0 ? 'awaiting' : 'history')
  const list = filtered.filter((o) => groups[view].includes(o) || kept.includes(o.id))
  const shopsWithOrders = data.shops.filter((s) =>
    (orders.data ?? []).some((o) => o.shop.id === s.id),
  )
  return (
    <Stack gap="md">
      <SegmentedControl
        fullWidth
        value={view}
        onChange={(next) => setView(next as View)}
        aria-label={t('admin.ledger.view')}
        data={(['needs', 'awaiting', 'history'] as const).map((v) => ({
          value: v,
          label: t(`admin.ledger.views.${v}`, { count: groups[v].length }),
        }))}
        className="ledger-views"
      />
      {data.characters.length > 1 && (
        <Chip.Group value={character} onChange={(v) => setCharacter(v as string)}>
          <Group
            gap="xs"
            className="kind-filter"
            role="group"
            aria-label={t('admin.ledger.character')}
          >
            <Chip value="all">{t('admin.ledger.everyone')}</Chip>
            {data.characters.map((c) => (
              <Chip key={c.id} value={c.id}>
                <span className="user-copy">{c.name}</span>
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      )}
      {shopsWithOrders.length > 1 && (
        <Chip.Group value={shop} onChange={(v) => setShop(v as string)}>
          <Group gap="xs" className="kind-filter" role="group" aria-label={t('admin.ledger.shop')}>
            <Chip value="all">{t('admin.ledger.allShops')}</Chip>
            {shopsWithOrders.map((s) => (
              <Chip key={s.id} value={s.id}>
                <span className="user-copy">{s.name}</span>
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      )}
      <QueryFeedback
        pending={orders.isPending}
        error={orders.isError}
        retry={() => void orders.refetch()}
      />
      {orders.data && list.length === 0 && (
        <Text c="dimmed">{t(`admin.ledger.empty.${view}`)}</Text>
      )}
      <div className="order-grid" aria-live="polite">
        {list.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            role="dm"
            busy={busy}
            onAction={(next) => {
              if ('orderId' in next) setKept((prior) => [...prior, next.orderId])
              onAction(next)
            }}
          />
        ))}
      </div>
    </Stack>
  )
}
