import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { concentrationSave, ownChange, type CombatState, type Combatant } from '../domain/combat'

/** How long the notice and the row flash stay. */
const newsMs = 6_000
const flashMs = 2_500

export type News = { id: number; lines: string[] }

/** What the own characters' change signature is made of (stable across projection rebuilds). */
const signature = (own: readonly Combatant[]) =>
  own
    .map((c) =>
      [c.id, c.hp?.current, c.hp?.max, [...(c.conditions ?? [])].sort().join(','), c.concentration]
        .map((part) => String(part ?? ''))
        .join('|'),
    )
    .join(';')

/**
 * RYT-126 J4-04: when the DM changes the Player's own character (hit points, conditions,
 * concentration) the change reaches the Player: a notice with the delta and the new total, a flash
 * of the own row, a polite live-region sentence and a short vibration where the device has one.
 * Only what the Player projection already carries is reported; the concentration DC comes from the
 * visible hit event. The first state after mounting is not news.
 */
export function useOwnNews(state: CombatState) {
  const { t } = useTranslation()
  const own = state.combatants.filter((c) => c.is_own)
  const sig = signature(own)
  const [seen, setSeen] = useState({ sig, own })
  const [news, setNews] = useState<News | null>(null)
  const [flash, setFlash] = useState<{ ids: ReadonlySet<string>; turn: number }>({
    ids: new Set(),
    turn: 0,
  })
  if (seen.sig !== sig) {
    const before = new Map(seen.own.map((c) => [c.id, c]))
    setSeen({ sig, own })
    const lines: string[] = []
    const changed = new Set<string>()
    for (const c of own) {
      const previous = before.get(c.id)
      const change = previous ? ownChange(previous, c) : null
      if (!change) continue
      changed.add(c.id)
      if (change.hp) {
        const key = change.hp.delta < 0 ? 'combat.news.lost' : 'combat.news.gained'
        lines.push(
          t(key, {
            amount: Math.abs(change.hp.delta),
            current: change.hp.current,
            max: change.hp.max,
          }),
        )
        const save = change.hp.delta < 0 ? concentrationSave(state.events, c.id) : null
        if (save && c.concentration) lines.push(t('combat.news.dc', { dc: save.dc }))
      }
      for (const key of change.added)
        lines.push(t('combat.news.conditionOn', { condition: t(`srd.condition.${key}`) }))
      for (const key of change.removed)
        lines.push(t('combat.news.conditionOff', { condition: t(`srd.condition.${key}`) }))
      if (change.concentration)
        lines.push(
          change.concentration.now
            ? t('combat.news.concentrationOn', { spell: change.concentration.now })
            : t('combat.news.concentrationOff'),
        )
    }
    if (lines.length > 0) {
      setNews((previous) => ({ id: (previous?.id ?? 0) + 1, lines }))
      setFlash((previous) => ({ ids: changed, turn: previous.turn + 1 }))
    }
  }
  useEffect(() => {
    if (news && typeof navigator.vibrate === 'function') navigator.vibrate(90)
  }, [news])
  useEffect(() => {
    if (!news) return
    const timer = window.setTimeout(() => setNews(null), newsMs)
    return () => window.clearTimeout(timer)
  }, [news])
  useEffect(() => {
    if (flash.ids.size === 0) return
    const timer = window.setTimeout(
      () => setFlash((p) => ({ ids: new Set(), turn: p.turn })),
      flashMs,
    )
    return () => window.clearTimeout(timer)
  }, [flash])
  return { news, dismiss: () => setNews(null), flash }
}
