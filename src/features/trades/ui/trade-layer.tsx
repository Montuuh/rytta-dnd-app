import { useEffect, useRef, useState } from 'react'
import { ActionIcon, UnstyledButton } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Handshake, X } from 'lucide-react'
import { Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { useCampaign, useCampaignView } from '@/features/campaigns'
import { config } from '@/shared/lib/config'
import { tradeStateQuery, useTradeAction, useTradeRealtime } from '../api'
import {
  formatCountdown,
  remainingMs,
  type RecentTrade,
  type TradeErrorCode,
} from '../domain/trade'
import { TradeContext } from './context'
import { InvitePopup, TradeDone } from './dialogs'
import { TradeWindow } from './trade-window'
import './trades.css'

/**
 * Route wrapper for campaign pages: renders the page and, for a viewer acting as a character
 * (Player, or DM in Player preview), the trade invitation, window, dock and completion.
 */
export function TradeLayer() {
  const campaign = useCampaign()
  const { playerPreview, previewUserId } = useCampaignView()
  const live = config.VITE_DATA_MODE === 'supabase'
  const acting = campaign.role === 'player' || (playerPreview && previewUserId !== null)
  if (!live || !acting) return <Outlet />
  return (
    <TradeCenter key={previewUserId ?? 'self'} actingUser={playerPreview ? previewUserId : null} />
  )
}

function TradeCenter({ actingUser }: { actingUser: string | null }) {
  const { t } = useTranslation()
  const { state: auth } = useAuth()
  const userId = auth.user!.id
  const campaign = useCampaign()
  const cache = useQueryClient()
  const query = useQuery(tradeStateQuery(userId, campaign.id, actingUser))
  useTradeRealtime(campaign.id, true)
  const action = useTradeAction(campaign.id)
  const state = query.data
  const [now, setNow] = useState(() => Date.now())
  const [later, setLater] = useState<string | null>(null)
  const [minimized, setMinimized] = useState<string | null>(null)
  const [seen, setSeen] = useState<string[]>([])
  const [closedDone, setClosedDone] = useState<string[]>([])
  const [inviteError, setInviteError] = useState<TradeErrorCode | null>(null)
  const handled = useRef(new Set<string>())
  const dock = useRef<HTMLButtonElement>(null)

  const raw = state?.trade ?? null
  const trade = raw && remainingMs(raw.expires_at, now) > 0 ? raw : null
  useEffect(() => {
    if (!raw) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [raw])
  // Remember trades this session watched live, so only their endings are announced.
  if (trade && !seen.includes(trade.id)) setSeen([...seen, trade.id])

  // Closing moments: celebrate a completion, explain an ending the viewer did not cause.
  const recent = state?.recent && seen.includes(state.recent.id) ? state.recent : null
  // Keep the summary open until dismissed, even after the server stops reporting it.
  const [done, setDone] = useState<RecentTrade | null>(null)
  if (recent?.status === 'completed' && !closedDone.includes(recent.id) && done?.id !== recent.id)
    setDone(recent)
  useEffect(() => {
    if (!recent || handled.current.has(recent.id)) return
    handled.current.add(recent.id)
    if (recent.status === 'completed')
      void cache.invalidateQueries({ queryKey: ['private', userId, 'campaign', campaign.id] })
    else if (!recent.closed_by_you)
      notifications.show({
        message: t(`trade.ended.${recent.status as 'declined' | 'cancelled' | 'expired'}`, {
          name: recent.partner.name,
        }),
      })
  }, [recent, cache, userId, campaign.id, t])

  const incoming = trade?.status === 'invited' && !trade.initiated_by_you
  const showInvite = incoming && later !== trade.id
  const showWindow = trade?.status === 'open' && minimized !== trade.id
  const showDock = trade && !showInvite && !showWindow
  const respond = (accept: boolean) =>
    trade &&
    action.mutate(
      { kind: 'respond', tradeId: trade.id, accept },
      {
        onSuccess: () => setInviteError(null),
        onError: (failure) => setInviteError(failure.message as TradeErrorCode),
      },
    )
  const reopen = () => {
    setLater(null)
    setMinimized(null)
  }
  const invite = (partnerId: string, partnerName: string) => {
    if (!state?.character) return
    action.mutate(
      { kind: 'invite', from: state.character.id, to: partnerId },
      {
        onSuccess: () => notifications.show({ message: t('trade.sent', { name: partnerName }) }),
        onError: (failure) =>
          notifications.show({
            color: 'red',
            message: t(`trade.error.${failure.message as TradeErrorCode}`),
          }),
      },
    )
  }
  const focusDock = () => requestAnimationFrame(() => dock.current?.focus())

  return (
    <TradeContext.Provider
      value={{
        state,
        invite,
        inviting:
          action.isPending && action.variables?.kind === 'invite' ? action.variables.to : null,
        reopen,
      }}
    >
      <Outlet />
      {showInvite && (
        <InvitePopup
          trade={trade}
          now={now}
          error={inviteError}
          pending={
            action.isPending && action.variables?.kind === 'respond'
              ? action.variables.accept
                ? 'accept'
                : 'decline'
              : null
          }
          onAccept={() => respond(true)}
          onDecline={() => respond(false)}
          onLater={() => {
            setLater(trade.id)
            focusDock()
          }}
        />
      )}
      {showWindow && state && (
        <TradeWindow
          key={trade.id}
          campaignId={campaign.id}
          trade={trade}
          items={state.items}
          purse={state.character?.gold ?? 0}
          now={now}
          refresh={async () => (await query.refetch()).data?.trade}
          onMinimize={() => {
            setMinimized(trade.id)
            focusDock()
          }}
        />
      )}
      {showDock && (
        <aside className="trade-dock" aria-label={t('trade.dock.region')}>
          {trade.status === 'invited' && trade.initiated_by_you ? (
            <>
              <span className="trade-dock-label" role="status">
                <Handshake size={18} aria-hidden="true" />
                <span className="user-copy">
                  {t('trade.dock.waiting', {
                    name: trade.partner.name,
                    time: formatCountdown(remainingMs(trade.expires_at, now)),
                  })}
                </span>
              </span>
              <ActionIcon
                size={44}
                variant="subtle"
                color="red"
                aria-label={t('trade.dock.waitingCancel', { name: trade.partner.name })}
                onClick={() =>
                  action.mutate({
                    kind: 'cancel',
                    tradeId: trade.id,
                    acting: trade.you.character_id,
                  })
                }
              >
                <X size={18} aria-hidden="true" />
              </ActionIcon>
            </>
          ) : (
            <UnstyledButton
              ref={dock}
              className="trade-dock-button"
              aria-label={t(
                trade.status === 'invited' ? 'trade.dock.inviteLabel' : 'trade.dock.openLabel',
                {
                  name: trade.partner.name,
                },
              )}
              onClick={reopen}
            >
              <Handshake size={18} aria-hidden="true" />
              <span className="user-copy" aria-hidden="true">
                {trade.status === 'invited'
                  ? t('trade.dock.invite', {
                      name: trade.partner.name,
                      time: formatCountdown(remainingMs(trade.expires_at, now)),
                    })
                  : t('trade.dock.open', { name: trade.partner.name })}
              </span>
            </UnstyledButton>
          )}
        </aside>
      )}
      {done && (
        <TradeDone
          trade={done}
          onClose={() => {
            setClosedDone([...closedDone, done.id])
            setDone(null)
          }}
        />
      )}
    </TradeContext.Provider>
  )
}
