import { localizedName } from '@/shared/lib/translations'
import { useEffect, useState } from 'react'
import { Anchor, Text, UnstyledButton } from '@mantine/core'
import { Undo2 } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  undoRemainingMs,
  type InventoryEvent,
  type ItemDefinition,
  type ItemStack,
} from '../domain/item'
import { formatWhen } from '../domain/when'
import { ItemIcon } from './item-icon'

/** Vertical timeline of inventory events; undoable entries carry a seal with the time left. */
export function Ledger({
  events,
  stacks,
  definitions,
  dm,
  userId,
  actorName,
  ordersHref,
  pending,
  onUndo,
}: {
  events: InventoryEvent[]
  stacks: Map<string, ItemStack>
  definitions: Map<string, ItemDefinition>
  dm: boolean
  userId: string
  actorName: (id: string | null) => string
  /** Where a purchase, sale or revert is itemised: the order carries the price and the shop. */
  ordersHref: string
  pending: boolean
  onUndo: (event: InventoryEvent) => void
}) {
  const { t, i18n } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  if (events.length === 0)
    return (
      <Text c="dimmed" className="ledger-empty">
        {t('inventory.ledger.empty')}
      </Text>
    )
  return (
    <ol className="ledger" aria-label={t('inventory.view.ledger')}>
      {events.map((event) => {
        const definitionId =
          stacks.get(event.item_id)?.definition_id ??
          (event.after_value.definition_id as string | undefined)
        const definition = definitionId ? definitions.get(definitionId) : undefined
        const remaining = undoRemainingMs(event, now, dm, userId)
        const name = definition
          ? localizedName(definition, i18n.language)
          : t('inventory.ledger.unknownItem')
        return (
          <li
            key={event.id}
            className={`ledger-entry kind-${event.kind}`}
            data-undone={event.undone_by ? true : undefined}
          >
            <span className="ledger-icon" aria-hidden="true">
              <ItemIcon icon={definition?.icon ?? 'package'} size={18} />
            </span>
            <div className="ledger-body">
              <Text size="sm" className="user-copy">
                {t(`inventory.ledger.${event.kind}`, {
                  actor: actorName(event.actor_id),
                  name,
                  amount: Math.abs(event.quantity_delta),
                })}
                {event.undone_by && (
                  <span className="ledger-undone"> · {t('inventory.ledger.undone')}</span>
                )}
              </Text>
              <Text size="xs" c="dimmed">
                {formatWhen(event.created_at, i18n.language)}
                {/* The event has no price or shop (see the RYT-125 note), so the way to them is the orders. */}
                {(event.kind === 'purchase' ||
                  event.kind === 'sale' ||
                  event.kind === 'revert') && (
                  <>
                    {' · '}
                    <Anchor
                      component={Link}
                      to={ordersHref}
                      size="xs"
                      className="ledger-orders-link"
                    >
                      {t('inventory.ledger.seeOrders')}
                    </Anchor>
                  </>
                )}
              </Text>
            </div>
            {remaining > 0 && (
              <UnstyledButton
                className="undo-seal small"
                disabled={pending}
                onClick={() => onUndo(event)}
                aria-label={
                  Number.isFinite(remaining)
                    ? t('inventory.ledger.undoTimed', {
                        name,
                        minutes: Math.ceil(remaining / 60_000),
                      })
                    : t('inventory.ledger.undoAny', { name })
                }
              >
                <Undo2 size={16} aria-hidden="true" />
                <span aria-hidden="true">
                  {Number.isFinite(remaining)
                    ? t('inventory.undo.short', { minutes: Math.ceil(remaining / 60_000) })
                    : t('inventory.undo.action')}
                </span>
              </UnstyledButton>
            )}
          </li>
        )
      })}
    </ol>
  )
}
