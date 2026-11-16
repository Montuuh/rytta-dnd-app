import { useRef, useState, type KeyboardEvent } from 'react'
import { Button, Drawer, Modal, Text, UnstyledButton } from '@mantine/core'
import { usePhone } from '@/shared/ui/use-viewport'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ItemIcon, type CatalogueItem } from '@/features/inventory'
import { localizedDescription, localizedName } from '@/shared/lib/translations'
import { tradeSlots, type OfferLine, type TradeItem } from '../domain/trade'
import { Stepper } from './stepper'

/** Chooses one free stack and an amount for the own offer. Bottom sheet on phones. */
export function ItemPicker({
  items,
  lines,
  initialItem,
  onPick,
  onClose,
  details,
}: {
  details?: Map<string, CatalogueItem>
  items: TradeItem[]
  lines: OfferLine[]
  initialItem: string | null
  onPick: (itemId: string, quantity: number) => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const phone = usePhone()
  const nameOf = (item: TradeItem) => localizedName(item, i18n.language)
  const [selected, setSelected] = useState<string | null>(initialItem ?? items[0]?.item_id ?? null)
  const offered = new Map(lines.map((line) => [line.item_id, line.quantity]))
  const current = items.find((item) => item.item_id === selected)
  const [amount, setAmount] = useState(() => (selected ? (offered.get(selected) ?? 1) : 1))
  const full = lines.length >= tradeSlots && !offered.has(selected ?? '')
  const choose = (item: TradeItem) => {
    setSelected(item.item_id)
    setAmount(Math.min(item.quantity, offered.get(item.item_id) ?? 1))
  }
  const list = useRef<HTMLUListElement>(null)
  // Listbox keyboard contract: one Tab stop, arrows/Home/End move focus and selection together.
  const roam = (event: KeyboardEvent<HTMLUListElement>) => {
    const keys: Record<string, (index: number) => number> = {
      ArrowDown: (index) => Math.min(items.length - 1, index + 1),
      ArrowUp: (index) => Math.max(0, index - 1),
      Home: () => 0,
      End: () => items.length - 1,
    }
    const move = keys[event.key]
    if (!move) return
    event.preventDefault()
    const index = items.findIndex((item) => item.item_id === selected)
    const next = items[move(Math.max(0, index))]
    if (!next) return
    choose(next)
    list.current?.querySelector<HTMLElement>(`[data-option="${CSS.escape(next.item_id)}"]`)?.focus()
  }
  const body = (
    <div className="trade-picker">
      {items.length === 0 ? (
        <Text c="dimmed">{t('trade.picker.empty')}</Text>
      ) : (
        <>
          <ul
            ref={list}
            className="trade-picker-list"
            role="listbox"
            aria-label={t('trade.picker.title')}
            onKeyDown={roam}
          >
            {items.map((item) => {
              const inOffer = offered.get(item.item_id)
              return (
                <li key={item.item_id} role="presentation">
                  <UnstyledButton
                    role="option"
                    aria-selected={item.item_id === selected}
                    tabIndex={item.item_id === selected ? 0 : -1}
                    data-option={item.item_id}
                    className={`trade-picker-row rarity-${item.rarity}`}
                    onClick={() => choose(item)}
                  >
                    <span className="trade-picker-icon" aria-hidden="true">
                      <ItemIcon
                        icon={item.icon}
                        imagePath={details?.get(item.definition_id)?.image_path}
                        size={24}
                      />
                    </span>
                    <span className="trade-picker-text">
                      <span className="trade-picker-name user-copy">{nameOf(item)}</span>
                      <span className="trade-picker-meta">
                        {t('trade.picker.have', { quantity: item.quantity })}
                        {inOffer ? ` · ${t('trade.picker.inOffer', { quantity: inOffer })}` : ''}
                      </span>
                    </span>
                  </UnstyledButton>
                </li>
              )
            })}
          </ul>
          {current && (
            <div className="trade-picker-amount">
              <Text fw={600} className="user-copy" aria-hidden="true">
                {nameOf(current)}
              </Text>
              {(() => {
                const detail = details?.get(current.definition_id)
                const text = detail ? localizedDescription(detail, i18n.language) : ''
                return text ? (
                  <Text size="sm" className="trade-picker-description user-copy preserve-lines">
                    {text}
                  </Text>
                ) : null
              })()}
              <Stepper
                value={amount}
                min={1}
                max={current.quantity}
                label={t('trade.picker.quantity', { name: nameOf(current) })}
                lessLabel={t('trade.picker.less', { name: nameOf(current) })}
                moreLabel={t('trade.picker.more', { name: nameOf(current) })}
                onChange={setAmount}
                autoFocus
              />
              {full && (
                <Text size="sm" c="dimmed" role="status">
                  {t('trade.picker.slotsFull')}
                </Text>
              )}
              <div className="trade-picker-actions">
                {offered.has(current.item_id) && (
                  <Button
                    variant="subtle"
                    color="red"
                    size="md"
                    leftSection={<X size={18} aria-hidden="true" />}
                    onClick={() => onPick(current.item_id, 0)}
                  >
                    {t('trade.picker.remove')}
                  </Button>
                )}
                <Button size="md" disabled={full} onClick={() => onPick(current.item_id, amount)}>
                  {t(offered.has(current.item_id) ? 'trade.picker.update' : 'trade.picker.add')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
  const close = { 'aria-label': t('action.cancel'), size: 44 }
  return phone ? (
    <Drawer
      opened
      onClose={onClose}
      position="bottom"
      size="auto"
      title={t('trade.picker.title')}
      closeButtonProps={close}
      returnFocus={false}
      className="trade-picker-sheet"
    >
      {body}
    </Drawer>
  ) : (
    <Modal
      opened
      onClose={onClose}
      centered
      title={t('trade.picker.title')}
      closeButtonProps={close}
      returnFocus={false}
    >
      {body}
    </Modal>
  )
}
