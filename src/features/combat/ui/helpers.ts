import { useCallback, useEffect, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { useCombatAction } from '../api'
import {
  isCombatErrorCode,
  staleAfterMs,
  type CombatAction,
  type CombatCondition,
  type CombatErrorCode,
  type CombatState,
  type CombatEvent,
  type Combatant,
  type MutationResult,
} from '../domain/combat'

export type Run = (
  action: CombatAction,
  onResult?: (result: MutationResult) => void,
) => Promise<boolean>

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
    async (next, onResult) => {
      const trigger = actionTrigger()
      setFailure(null)
      let result: MutationResult
      try {
        result = await mutateAsync(next)
      } catch (error) {
        const code = error instanceof Error ? error.message : 'unavailable'
        setFailure({ code: isCombatErrorCode(code) ? code : 'unavailable', trigger })
        return false
      }
      onResult?.(result)
      return true
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

/** RYT-045: announces every new death save of the encounter (anyone's) once, with its outcome. */
export function useDeathSaveAnnouncements(state: CombatState) {
  const { t } = useTranslation()
  const rolls = state.events.filter((e) => e.kind === 'death_save' && !e.undone)
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set(rolls.map((e) => e.id)))
  const [text, setText] = useState('')
  const fresh = rolls.filter((e) => !seen.has(e.id))
  if (fresh.length > 0) {
    setSeen(new Set([...seen, ...fresh.map((e) => e.id)]))
    // Events arrive newest first; one sentence per refresh is enough at the table.
    const latest = fresh[0]!
    const detail = latest.detail as { outcome?: string; result?: string | null }
    const key = detail.result ?? detail.outcome ?? 'success'
    const known = ['success', 'failure', 'nat1', 'stable', 'dead', 'up'] as const
    const which = (known as readonly string[]).includes(key)
      ? (key as (typeof known)[number])
      : 'success'
    setText(t(`combat.death.announce.${which}`, { name: latest.target_name ?? '' }))
  }
  return text
}

/** The browser's own connection flag, followed live. */
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

/**
 * "Last known" state: offline, failing or older than the polling budget (`limit`, which a screen
 * that is pushed by realtime and polls rarely raises to its own poll interval).
 */
export function useFreshness(updatedAt: number, failing: boolean, limit = staleAfterMs) {
  const [now, setNow] = useState(() => Date.now())
  const online = useOnline()
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 5_000)
    return () => window.clearInterval(tick)
  }, [])
  return !online || failing || (updatedAt > 0 && now - updatedAt > limit)
}

/**
 * RYT-126 J4-27: true for a few seconds after the page comes back to the foreground (a phone
 * unlocked, a tab reopened) until a fetch newer than that moment lands. What was on screen is the
 * old state; the banner says it is updating instead of showing a stale "Your turn!".
 */
export function useResuming(updatedAt: number) {
  const [since, setSince] = useState(0)
  useEffect(() => {
    let hiddenAt = 0
    const change = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > 3_000) {
        setSince(Date.now())
        hiddenAt = 0
      }
    }
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])
  useEffect(() => {
    if (!since) return
    const timer = window.setTimeout(() => setSince(0), 6_000)
    return () => window.clearTimeout(timer)
  }, [since])
  return since > 0 && updatedAt < since
}

export function sideLabel(t: TFunction, combatant: Combatant) {
  return t(combatant.kind === 'lair' ? 'combat.side.lair' : `combat.side.${combatant.side}`)
}

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
    // ADR 028: an alias revealed, a server recharge roll and a tracker change (DM only).
    case 'reveal':
      return detail.alias
        ? t('combat.event.revealAlias', { target, alias: detail.alias })
        : t('combat.event.reveal', { target })
    case 'recharge':
      return t(
        (event.detail as { recharged?: boolean }).recharged
          ? 'combat.event.rechargeYes'
          : 'combat.event.rechargeNo',
        { target, label: detail.label ?? '', roll: event.amount ?? '' },
      )
    case 'tracker':
      return t(
        detail.kind !== 'recharge'
          ? 'combat.event.tracker'
          : event.amount
            ? 'combat.event.trackerSpent'
            : 'combat.event.trackerReady',
        { target, label: detail.label ?? '', amount: event.amount ?? 0 },
      )
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
      if (opener) focusWhenReady(() => (opener.isConnected ? opener : null))
    },
    [opener],
  )
}

/** A drawer must not close on the Escape meant for a dialog opened on top of it. */
export const onlyTopDialog = (close: () => void) => () => {
  if (document.querySelectorAll('[role="dialog"]').length > 1) return
  close()
}
