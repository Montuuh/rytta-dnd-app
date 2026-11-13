import { useId } from 'react'
import { Loader, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { ArrowLeftRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTrades } from './context'
import { SummaryList } from './dialogs'

/** RYT-097: the round trade icon on a teammate's portrait. Renders nothing where the viewer does
 * not act as a character or the teammate cannot trade. It stays focusable while unavailable so
 * the reason can be read. */
export function TradeButton({ partnerId, name }: { partnerId: string; name: string }) {
  const { t } = useTranslation()
  const trades = useTrades()
  const reasonId = useId()
  const partner = trades?.state?.partners.find((p) => p.id === partnerId)
  if (!trades?.state?.character || !partner) return null
  const active = trades.state.trade
  const withThem = active?.partner.character_id === partnerId
  const inviting = trades.inviting === partnerId
  const reason = withThem
    ? null
    : partner.busy
      ? t('trade.partnerIsBusy', { name })
      : active
        ? t('trade.otherOpen')
        : null
  const unavailable = Boolean(reason) || trades.inviting !== null
  const label = withThem ? t('trade.dock.openLabel', { name }) : t('trade.actionWith', { name })
  return (
    <Tooltip
      label={reason ?? label}
      // A tap leaves focus on the icon: only a reason to wait is worth showing there.
      events={{ hover: true, focus: Boolean(reason), touch: Boolean(reason) }}
      withinPortal
    >
      <UnstyledButton
        className="trade-icon"
        data-active={withThem || undefined}
        aria-label={label}
        aria-describedby={reason ? reasonId : undefined}
        aria-disabled={unavailable || undefined}
        aria-busy={inviting || undefined}
        onClick={() => {
          if (withThem) trades.reopen()
          else if (!unavailable) trades.invite(partnerId, name)
        }}
      >
        {inviting ? (
          <Loader size={18} color="currentColor" aria-hidden="true" />
        ) : (
          <ArrowLeftRight size={20} aria-hidden="true" />
        )}
        {reason && (
          <span id={reasonId} className="visually-hidden">
            {reason}
          </span>
        )}
      </UnstyledButton>
    </Tooltip>
  )
}

/** The viewer's last completed trades, newest first. */
export function TradeHistory() {
  const { t, i18n } = useTranslation()
  const trades = useTrades()
  const history = trades?.state?.history ?? []
  if (!trades?.state?.character || history.length === 0) return null
  return (
    <section className="trade-history" aria-labelledby="trade-history-heading">
      <h2 id="trade-history-heading" className="trade-history-title">
        {t('trade.history.title')}
      </h2>
      <ol className="trade-history-list">
        {history.map((entry) => (
          <li key={entry.id} className="trade-history-entry">
            <div className="trade-history-head">
              <span className="user-copy">{t('trade.history.with', { name: entry.partner })}</span>
              <Text size="xs" c="dimmed" component="span">
                {new Date(entry.completed_at).toLocaleString(i18n.language, {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </Text>
            </div>
            <div className="trade-history-sides">
              <div>
                <Text size="xs" c="dimmed">
                  {t('trade.done.received')}
                </Text>
                <SummaryList side={entry.received} />
              </div>
              <div>
                <Text size="xs" c="dimmed">
                  {t('trade.done.gave')}
                </Text>
                <SummaryList side={entry.gave} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
