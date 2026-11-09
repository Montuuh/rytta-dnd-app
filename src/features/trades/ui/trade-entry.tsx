import { Button, Menu, Text, UnstyledButton } from '@mantine/core'
import { ArrowLeftRight, ChevronDown, Handshake } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCampaign } from '@/features/campaigns'
import { CharacterPortrait, useCampaignPortraits } from '@/features/inventory'
import { useTrades } from './context'
import { SummaryList } from './dialogs'

/** "Trade" on a teammate card. Renders nothing where the viewer does not act as a character. */
export function TradeButton({ partnerId, name }: { partnerId: string; name: string }) {
  const { t } = useTranslation()
  const trades = useTrades()
  const partner = trades?.state?.partners.find((p) => p.id === partnerId)
  if (!trades?.state?.character || !partner) return null
  const active = trades.state.trade
  const withThem = active?.partner.character_id === partnerId
  const busy = partner.busy && !withThem
  return (
    <UnstyledButton
      className="teammate-trade"
      aria-label={busy ? undefined : t('trade.actionWith', { name })}
      disabled={trades.inviting !== null || (Boolean(active) && !withThem) || busy}
      onClick={() => (withThem ? trades.reopen() : trades.invite(partnerId, name))}
    >
      <ArrowLeftRight size={18} aria-hidden="true" />
      <span>{busy ? t('trade.partnerIsBusy', { name }) : t('trade.action')}</span>
    </UnstyledButton>
  )
}

/** Character picker for starting a trade with any assigned character of the campaign. */
export function TradeLauncher() {
  const { t } = useTranslation()
  const trades = useTrades()
  const campaign = useCampaign()
  const portraits = useCampaignPortraits(campaign.id)
  if (!trades?.state?.character) return null
  const { partners, trade } = trades.state
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <Button
          variant="light"
          size="md"
          leftSection={<Handshake size={18} aria-hidden="true" />}
          rightSection={<ChevronDown size={16} aria-hidden="true" />}
          disabled={Boolean(trade) || trades.inviting !== null}
        >
          {t('trade.launcher')}
        </Button>
      </Menu.Target>
      <Menu.Dropdown maw="calc(100vw - 32px)">
        <Menu.Label>{t('trade.pickPartner')}</Menu.Label>
        {partners.length === 0 && (
          <Text size="sm" c="dimmed" px="sm" py="xs">
            {t('trade.noPartners')}
          </Text>
        )}
        {partners.map((partner) => (
          <Menu.Item
            key={partner.id}
            leftSection={
              <CharacterPortrait
                campaignId={campaign.id}
                characterId={partner.id}
                name={partner.name}
                path={portraits.get(partner.id) ?? null}
                size={32}
              />
            }
            disabled={partner.busy}
            className="user-copy trade-menu-item"
            onClick={() => trades.invite(partner.id, partner.name)}
          >
            {partner.busy ? t('trade.partnerIsBusy', { name: partner.name }) : partner.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
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
