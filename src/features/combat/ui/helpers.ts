import { useCallback, useEffect, useState } from 'react'
import type { TFunction } from 'i18next'
import { useCombatAction } from '../api'
import {
  isCombatErrorCode,
  staleAfterMs,
  type CombatAction,
  type CombatCondition,
  type CombatErrorCode,
  type CombatEvent,
  type Combatant,
  type HpStatus,
} from '../domain/combat'

export type Run = (action: CombatAction) => Promise<boolean>

/** One mutation runner per screen: a shared pending flag and a visible, localized error. */
export function useRunner(campaignId: string) {
  const action = useCombatAction(campaignId)
  const [error, setError] = useState<CombatErrorCode | null>(null)
  const { mutateAsync } = action
  const run = useCallback<Run>(
    async (next) => {
      setError(null)
      try {
        await mutateAsync(next)
        return true
      } catch (failure) {
        const code = failure instanceof Error ? failure.message : 'unavailable'
        setError(isCombatErrorCode(code) ? code : 'unavailable')
        return false
      }
    },
    [mutateAsync],
  )
  return { run, pending: action.isPending, error, clear: () => setError(null) }
}

/** "Last known" state: offline, failing or older than the polling budget. */
export function useFreshness(updatedAt: number, failing: boolean) {
  const [now, setNow] = useState(() => Date.now())
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 5_000)
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.clearInterval(tick)
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return !online || failing || (updatedAt > 0 && now - updatedAt > staleAfterMs)
}

export function sideLabel(t: TFunction, combatant: Combatant) {
  return t(combatant.kind === 'lair' ? 'combat.side.lair' : `combat.side.${combatant.side}`)
}

export const statusTone = (status: HpStatus | undefined) =>
  status === 'unhurt' || status === 'wounded'
    ? status === 'unhurt'
      ? 'healthy'
      : 'wounded'
    : status === 'bloodied'
      ? 'critical'
      : status === 'down'
        ? 'down'
        : 'unknown'

/** Localized one-line description of a log event. */
export function eventText(t: TFunction, event: CombatEvent) {
  const detail = event.detail as Record<string, string | undefined>
  const target = event.target_name ?? ''
  const condition = detail.condition
    ? t(`srd.condition.${detail.condition as CombatCondition}`)
    : ''
  switch (event.kind) {
    case 'status':
      return t('combat.event.status', {
        status: t(`combat.status.${(detail.status ?? 'active') as 'active'}`),
      })
    case 'round':
      return t('combat.event.round', { round: event.round, target })
    case 'concentration':
      return detail.spell
        ? t('combat.event.concentration', { target, spell: detail.spell })
        : t('combat.event.concentrationEnd', { target })
    case 'death_save':
      return t('combat.event.death_save', {
        target,
        outcome: t(`combat.death.${(detail.outcome ?? 'success') as 'success'}`),
      })
    default:
      return t(`combat.event.${event.kind}`, {
        target,
        amount: event.amount ?? '',
        condition,
        label: detail.label ?? '',
        spell: detail.spell ?? '',
      })
  }
}
