import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Modal, Text, UnstyledButton, VisuallyHidden } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { ArrowLeftRight, Coins, Handshake, Lock, LockOpen, Minimize2, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ItemIcon } from '@/features/inventory'
import { useTradeAction } from '../api'
import {
  formatCountdown,
  offerLines,
  remainingMs,
  sameOffer,
  tradeSlots,
  withLine,
  type OfferLine,
  type Trade,
  type TradeErrorCode,
  type TradeItem,
  type TradeSide,
} from '../domain/trade'
import { ItemPicker } from './item-picker'
import { Stepper } from './stepper'

type Draft = { lines: OfferLine[]; gold: number }

/**
 * The barter table: your offer and the partner's, facing each other across two seals.
 * Your edits save immediately (gold is debounced); every saved change reopens both seals.
 */
export function TradeWindow({
  campaignId,
  trade,
  items,
  purse,
  now,
  refresh,
  onMinimize,
}: {
  campaignId: string
  trade: Trade
  items: TradeItem[]
  purse: number
  now: number
  refresh: () => Promise<Trade | null | undefined>
  onMinimize: () => void
}) {
  const { t } = useTranslation()
  const phone = useMediaQuery('(max-width: 48em)')
  const action = useTradeAction(campaignId)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<TradeErrorCode | null>(null)
  const [picker, setPicker] = useState<{ item: string | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const revision = useRef(trade.revision)
  useEffect(() => {
    revision.current = trade.revision
  }, [trade.revision])
  const timer = useRef<number | null>(null)
  // A newer revision that cleared every seal means someone changed the offer.
  const anySealed = trade.you.confirmed || trade.partner.confirmed
  const [sealedAt, setSealedAt] = useState<number | null>(anySealed ? trade.revision : null)
  if (anySealed && sealedAt !== trade.revision) setSealedAt(trade.revision)
  const unlocked = !anySealed && sealedAt !== null && trade.revision > sealedAt
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  const server: Draft = { lines: offerLines(trade.you), gold: trade.you.gold }
  const shown = draft ?? server
  const byId = new Map(items.map((item) => [item.item_id, item]))
  for (const item of trade.you.items) if (!byId.has(item.item_id)) byId.set(item.item_id, item)

  const flush = (next: Draft, attempt = 0) => {
    setSaving(true)
    action.mutate(
      {
        kind: 'offer',
        tradeId: trade.id,
        acting: trade.you.character_id,
        revision: revision.current,
        items: next.lines,
        gold: next.gold,
      },
      {
        onSuccess: () => {
          setSaving(false)
          setDraft(null)
          setError(null)
        },
        onError: async (failure) => {
          // The partner's edit moved the revision: re-apply this side on the fresh revision.
          if (failure.message === 'stale' && attempt < 2) {
            const fresh = await refresh()
            if (fresh) {
              revision.current = fresh.revision
              return flush(next, attempt + 1)
            }
          }
          setSaving(false)
          setDraft(null)
          setError(failure.message as TradeErrorCode)
        },
      },
    )
  }
  const change = (next: Draft, delay = 0) => {
    setDraft(next)
    setError(null)
    if (timer.current !== null) window.clearTimeout(timer.current)
    if (sameOffer(next.lines, server.lines) && next.gold === server.gold) {
      setDraft(null)
      return
    }
    timer.current = window.setTimeout(() => {
      timer.current = null
      flush(next)
    }, delay)
  }
  const pending = saving || draft !== null
  const confirm = () =>
    action.mutate(
      {
        kind: 'confirm',
        tradeId: trade.id,
        acting: trade.you.character_id,
        revision: trade.revision,
      },
      { onError: (failure) => setError(failure.message as TradeErrorCode) },
    )
  const cancel = () =>
    action.mutate(
      { kind: 'cancel', tradeId: trade.id, acting: trade.you.character_id },
      { onError: (failure) => setError(failure.message as TradeErrorCode) },
    )
  const left = remainingMs(trade.expires_at, now)
  const partner = trade.partner.name
  const youLabel = t('trade.window.yourOffer')
  const theirLabel = t('trade.window.theirOffer', { name: partner })
  const sealed = trade.you.confirmed && !pending

  return (
    <Modal
      opened
      onClose={onMinimize}
      centered
      fullScreen={phone}
      size={1040}
      title={
        <span className="trade-title">
          <Handshake size={22} aria-hidden="true" />
          <span className="user-copy">{t('trade.window.title', { name: partner })}</span>
        </span>
      }
      closeButtonProps={{
        'aria-label': t('trade.window.minimize'),
        size: 44,
        icon: <Minimize2 size={20} aria-hidden="true" />,
      }}
      classNames={{ content: 'trade-window', body: 'trade-window-body' }}
    >
      <Text size="sm" c="dimmed" className="trade-hint">
        {t('trade.window.hint')}{' '}
        <span className="trade-expiry">
          {t('trade.window.expires', { time: formatCountdown(left) })}
        </span>
      </Text>
      <div className="trade-table">
        <OfferColumn
          side={trade.you}
          label={youLabel}
          own
          confirmed={sealed}
          byId={byId}
          lines={shown.lines}
          gold={shown.gold}
          purse={purse}
          onSlot={(item) => setPicker({ item })}
          onGold={(gold) => change({ ...shown, gold }, 500)}
        />
        <div className="trade-seam" aria-hidden="true">
          <span className="trade-seal" data-on={sealed || undefined}>
            {sealed ? <Lock size={20} /> : <LockOpen size={20} />}
          </span>
          <ArrowLeftRight size={20} className="trade-seam-arrows" />
          <span className="trade-seal" data-on={trade.partner.confirmed || undefined}>
            {trade.partner.confirmed ? <Lock size={20} /> : <LockOpen size={20} />}
          </span>
        </div>
        <OfferColumn
          side={trade.partner}
          label={theirLabel}
          confirmed={trade.partner.confirmed}
          byId={new Map(trade.partner.items.map((item) => [item.item_id, item]))}
          lines={offerLines(trade.partner)}
          gold={trade.partner.gold}
        />
      </div>
      <div aria-live="polite" className="trade-status">
        {unlocked && <Text size="sm">{t('trade.window.unlocked')}</Text>}
        {pending && <Text size="sm">{t('trade.window.saving')}</Text>}
        {!pending && !unlocked && (
          <Text size="sm" c="dimmed">
            {t(
              trade.partner.confirmed
                ? 'trade.window.partnerAccepted'
                : 'trade.window.partnerEditing',
              { name: partner },
            )}
          </Text>
        )}
      </div>
      {error && (
        <Alert color="red" role="alert" className="trade-error">
          {t(`trade.error.${error}`)}
        </Alert>
      )}
      <footer className="trade-footer">
        <Button
          variant="subtle"
          color="red"
          size="md"
          leftSection={<X size={18} aria-hidden="true" />}
          onClick={cancel}
          disabled={action.isPending && action.variables?.kind === 'cancel'}
        >
          {t('trade.window.cancel')}
        </Button>
        <Button
          size="lg"
          className="trade-accept"
          data-sealed={sealed || undefined}
          leftSection={
            sealed ? (
              <Lock size={20} aria-hidden="true" />
            ) : (
              <Handshake size={20} aria-hidden="true" />
            )
          }
          disabled={pending || trade.you.confirmed}
          loading={action.isPending && action.variables?.kind === 'confirm'}
          onClick={confirm}
        >
          {trade.you.confirmed
            ? t('trade.window.accepted', { name: partner })
            : t('trade.window.accept')}
        </Button>
      </footer>
      {picker && (
        <ItemPicker
          items={items}
          lines={shown.lines}
          initialItem={picker.item}
          onClose={() => setPicker(null)}
          onPick={(itemId, quantity) => {
            setPicker(null)
            change({ ...shown, lines: withLine(shown.lines, itemId, quantity) })
          }}
        />
      )}
    </Modal>
  )
}

function OfferColumn({
  side,
  label,
  own,
  confirmed,
  byId,
  lines,
  gold,
  purse,
  onSlot,
  onGold,
}: {
  side: TradeSide
  label: string
  own?: boolean
  confirmed: boolean
  byId: Map<string, TradeItem>
  lines: OfferLine[]
  gold: number
  purse?: number
  onSlot?: (itemId: string | null) => void
  onGold?: (gold: number) => void
}) {
  const { t } = useTranslation()
  const headingId = `trade-side-${own ? 'you' : 'partner'}`
  const state = t(confirmed ? 'trade.window.ready' : 'trade.window.editing')
  const firstEmpty = lines.length
  return (
    <section
      className="trade-side"
      data-own={own || undefined}
      data-confirmed={confirmed || undefined}
      aria-labelledby={headingId}
    >
      <header className="trade-side-head">
        <h3 id={headingId} className="trade-side-title user-copy">
          {label}
        </h3>
        <span className="trade-side-state" data-confirmed={confirmed || undefined}>
          {confirmed ? (
            <Lock size={16} aria-hidden="true" />
          ) : (
            <LockOpen size={16} aria-hidden="true" />
          )}
          {state}
        </span>
      </header>
      <ul
        className="trade-slots"
        aria-label={t('trade.window.slots', { side: label, used: lines.length, total: tradeSlots })}
      >
        {Array.from({ length: tradeSlots }, (_, index) => {
          const line = lines[index]
          const item = line ? byId.get(line.item_id) : undefined
          if (line && item) {
            const content = (
              <>
                <span className="trade-slot-icon" aria-hidden="true">
                  <ItemIcon icon={item.icon} size={26} />
                </span>
                <span className="trade-slot-qty" aria-hidden="true">
                  ×{line.quantity}
                </span>
                <span className="trade-slot-name user-copy" aria-hidden="true">
                  {item.name}
                </span>
              </>
            )
            return (
              <li key={line.item_id}>
                {own ? (
                  <UnstyledButton
                    className={`trade-slot filled rarity-${item.rarity}`}
                    aria-label={t('trade.window.slotItem', {
                      name: item.name,
                      quantity: line.quantity,
                    })}
                    onClick={() => onSlot?.(line.item_id)}
                  >
                    {content}
                  </UnstyledButton>
                ) : (
                  <div
                    className={`trade-slot filled rarity-${item.rarity}`}
                    role="img"
                    aria-label={t('trade.window.slotPartner', {
                      name: item.name,
                      quantity: line.quantity,
                    })}
                  >
                    {content}
                  </div>
                )}
              </li>
            )
          }
          return (
            <li key={`empty-${index}`} aria-hidden={own && index === firstEmpty ? undefined : true}>
              {own && index === firstEmpty ? (
                <UnstyledButton className="trade-slot empty add" onClick={() => onSlot?.(null)}>
                  <Plus size={22} aria-hidden="true" />
                  <span className="trade-slot-name">{t('trade.window.addItem')}</span>
                </UnstyledButton>
              ) : (
                <div className="trade-slot empty" />
              )}
            </li>
          )
        })}
      </ul>
      <div className="trade-gold">
        <Coins size={20} aria-hidden="true" className="trade-gold-icon" />
        {own && onGold ? (
          <>
            <Stepper
              value={gold}
              min={0}
              max={purse ?? 0}
              label={t('trade.window.goldInput')}
              lessLabel={t('trade.window.goldLess')}
              moreLabel={t('trade.window.goldMore')}
              onChange={onGold}
            />
            <Text size="sm" c="dimmed" className="trade-purse">
              {t('trade.window.goldPurse', { gold: purse ?? 0 })}
            </Text>
          </>
        ) : (
          <span className="trade-gold-value">
            <VisuallyHidden>{t('trade.window.goldOf', { name: side.name })}: </VisuallyHidden>
            {t('trade.window.gp', { gold })}
          </span>
        )}
      </div>
    </section>
  )
}
