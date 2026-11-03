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

// The last control a pointer touched: touch browsers do not always focus a tapped button.
let lastPointerTarget: HTMLElement | null = null
if (typeof document !== 'undefined')
  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target instanceof Element ? event.target : null
      lastPointerTarget =
        target?.closest<HTMLElement>('button, a, input, label, [role="button"]') ?? null
    },
    true,
  )

/** The control that started an action: the focused one, else the last one tapped. */
function actionTrigger() {
  const active = document.activeElement
  return active instanceof HTMLElement && active !== document.body ? active : lastPointerTarget
}

/** One mutation runner per screen: a shared pending flag and a visible, localized error that
 * remembers which control started the failed action (to keep it in view and return focus). */
export function useRunner(campaignId: string) {
  const action = useCombatAction(campaignId)
  const [failure, setFailure] = useState<{
    code: CombatErrorCode
    trigger: HTMLElement | null
  } | null>(null)
  const { mutateAsync } = action
  const run = useCallback<Run>(
    async (next) => {
      const trigger = actionTrigger()
      setFailure(null)
      try {
        await mutateAsync(next)
        return true
      } catch (error) {
        const code = error instanceof Error ? error.message : 'unavailable'
        setFailure({ code: isCombatErrorCode(code) ? code : 'unavailable', trigger })
        return false
      }
    },
    [mutateAsync],
  )
  return {
    run,
    pending: action.isPending,
    error: failure?.code ?? null,
    trigger: failure?.trigger ?? null,
    clear: () => setFailure(null),
  }
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

/** Conditionally mounted dialogs lose Mantine's focus return: send focus back to the control that
 * opened them when they unmount. A dialog opened from a menu item returns to the menu's button,
 * since the item (and the menu's own focus holder) disappear with the menu. */
export function useReturnFocus() {
  const [opener] = useState(() => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement) || active === document.body) return null
    const trigger = active.closest('[role="menu"]')?.getAttribute('aria-labelledby')
    return (trigger && document.getElementById(trigger)) || active
  })
  useEffect(
    () => () => {
      requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus()
      })
    },
    [opener],
  )
}

/** A drawer must not close on the Escape meant for a dialog opened on top of it. */
export const onlyTopDialog = (close: () => void) => () => {
  if (document.querySelectorAll('[role="dialog"]').length > 1) return
  close()
}
