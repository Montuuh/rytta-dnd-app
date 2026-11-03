import { Alert, Button, Modal, Text } from '@mantine/core'
import { Check, Coins, Handshake } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ItemIcon } from '@/features/inventory'
import {
  formatCountdown,
  remainingMs,
  type RecentTrade,
  type Trade,
  type TradeErrorCode,
  type TradeSummarySide,
} from '../domain/trade'

const inviteWindowMs = 120_000

/** Centered invitation. Escape or the close button only postpones; Decline answers. */
export function InvitePopup({
  trade,
  now,
  pending,
  error,
  onAccept,
  onDecline,
  onLater,
}: {
  trade: Trade
  now: number
  pending: 'accept' | 'decline' | null
  error: TradeErrorCode | null
  onAccept: () => void
  onDecline: () => void
  onLater: () => void
}) {
  const { t } = useTranslation()
  const left = remainingMs(trade.expires_at, now)
  const ratio = Math.min(1, left / inviteWindowMs)
  const name = trade.partner.name
  return (
    <Modal
      opened
      onClose={onLater}
      centered
      size="sm"
      title={<span className="user-copy">{t('trade.invite.title', { name })}</span>}
      closeButtonProps={{ 'aria-label': t('trade.invite.later'), size: 44 }}
      classNames={{ content: 'trade-invite', header: 'trade-invite-header' }}
      aria-describedby="trade-invite-body"
    >
      <div className="trade-invite-card">
        <div
          className="trade-invite-clock"
          role="timer"
          aria-label={`${t('trade.invite.expiresLabel')}: ${formatCountdown(left)}`}
          style={{ ['--clock' as string]: `${Math.round(ratio * 360)}deg` }}
        >
          <span className="trade-invite-clock-face" aria-hidden="true">
            <Handshake size={34} strokeWidth={1.6} />
          </span>
        </div>
        <Text id="trade-invite-body" c="dimmed" ta="center">
          {t('trade.invite.body')}
        </Text>
        <Text size="sm" fw={600} className="trade-invite-expiry" aria-hidden="true">
          {t('trade.invite.expires', { time: formatCountdown(left) })}
        </Text>
        {error && (
          <Alert color="red" role="alert" w="100%">
            {t(`trade.error.${error}`)}
          </Alert>
        )}
        <div className="trade-invite-actions">
          <Button
            size="lg"
            fullWidth
            data-autofocus
            leftSection={<Handshake size={20} aria-hidden="true" />}
            loading={pending === 'accept'}
            disabled={pending !== null}
            onClick={onAccept}
          >
            {t('trade.invite.accept')}
          </Button>
          <Button
            variant="subtle"
            size="md"
            fullWidth
            loading={pending === 'decline'}
            disabled={pending !== null}
            onClick={onDecline}
          >
            {t('trade.invite.decline')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function SummaryList({ side }: { side: TradeSummarySide | undefined }) {
  const { t } = useTranslation()
  if (!side || (side.items.length === 0 && side.gold === 0))
    return (
      <Text size="sm" c="dimmed">
        {t('trade.done.nothing')}
      </Text>
    )
  return (
    <ul className="trade-summary-list">
      {side.items.map((item, index) => (
        <li key={`${item.name}-${index}`} className={`rarity-${item.rarity}`}>
          <span className="trade-summary-icon" aria-hidden="true">
            <ItemIcon icon={item.icon} size={20} />
          </span>
          <span className="user-copy">
            {item.quantity} × {item.name}
          </span>
        </li>
      ))}
      {side.gold > 0 && (
        <li>
          <span className="trade-summary-icon gold" aria-hidden="true">
            <Coins size={20} />
          </span>
          <span>{t('trade.window.gp', { gold: side.gold })}</span>
        </li>
      )}
    </ul>
  )
}

/** The peak of the flow: a closing seal and what each side now holds. */
export function TradeDone({ trade, onClose }: { trade: RecentTrade; onClose: () => void }) {
  const { t } = useTranslation()
  const summary = trade.summary
  const mine = trade.initiated_by_you ? summary?.initiator : summary?.partner
  const theirs = trade.initiated_by_you ? summary?.partner : summary?.initiator
  return (
    <Modal
      opened
      onClose={onClose}
      centered
      size="md"
      title={t('trade.done.title')}
      closeButtonProps={{ 'aria-label': t('trade.done.close'), size: 44 }}
      classNames={{ content: 'trade-done' }}
    >
      <div className="trade-done-stamp" aria-hidden="true">
        <Check size={40} strokeWidth={2.4} />
      </div>
      <Text ta="center" mb="md">
        {t('trade.done.body')}
      </Text>
      <div className="trade-done-grid">
        <section aria-labelledby="trade-done-received">
          <h3 id="trade-done-received" className="trade-done-heading">
            {t('trade.done.received')}
          </h3>
          <SummaryList side={theirs} />
        </section>
        <section aria-labelledby="trade-done-gave">
          <h3 id="trade-done-gave" className="trade-done-heading">
            {t('trade.done.gave')}
          </h3>
          <SummaryList side={mine} />
        </section>
      </div>
      <Button fullWidth size="md" mt="lg" onClick={onClose} data-autofocus>
        {t('trade.done.close')}
      </Button>
    </Modal>
  )
}

export { SummaryList }
