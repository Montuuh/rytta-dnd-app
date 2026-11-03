import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, Badge, Button, Group, Portal, Text } from '@mantine/core'
import { Radio, Skull, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { healthBand, type Combatant, type CombatErrorCode } from '../domain/combat'
import { BandMark } from './token'

/** The body of the topmost open dialog or drawer, if any (nested ones portal last). */
function topDialogBody() {
  const bodies = document.querySelectorAll<HTMLElement>('.mantine-Modal-body, .mantine-Drawer-body')
  return bodies[bodies.length - 1] ?? null
}

/** Floating errors leave after this long unless the pointer or focus is on them. */
const toastMs = 8_000

/**
 * Action errors are never silent. Inside an open dialog they appear next to its actions; inside a
 * drawer they stick to the visible part of the drawer, so the control that failed stays in view;
 * otherwise they float (top on tablets, above the turn bar and navigation on phones) and dismiss
 * themselves after a while.
 */
export function RunnerError({
  error,
  trigger = null,
  onClose,
}: {
  error: CombatErrorCode | null
  /** The control that started the failed action. */
  trigger?: HTMLElement | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  // Resolved once per error: the dialog that was open when the write failed.
  const host = useMemo(() => (error ? topDialogBody() : null), [error])
  if (!error) return null
  const sticky = host?.matches('.mantine-Drawer-body') ?? false
  // Dismissing with the keyboard (or a tap on the close button) returns focus to that control.
  const dismiss = (alert: HTMLElement | null) => {
    const returnFocus = alert?.contains(document.activeElement) ?? false
    onClose()
    if (returnFocus && trigger?.isConnected) requestAnimationFrame(() => trigger.focus())
  }
  const alert = (
    <ErrorAlert sticky={sticky} trigger={trigger} onDismiss={dismiss}>
      {t(`combat.error.${error}`)}
    </ErrorAlert>
  )
  if (host)
    return (
      <Portal target={host}>
        <div className={`combat-inline-error${sticky ? ' is-sticky' : ''}`}>{alert}</div>
      </Portal>
    )
  return (
    <Portal>
      <FloatingError onClose={onClose}>{alert}</FloatingError>
    </Portal>
  )
}

/** The alert itself. Placement work runs once per error (not on every poll re-render). */
function ErrorAlert({
  sticky,
  trigger,
  onDismiss,
  children,
}: {
  sticky: boolean
  trigger: HTMLElement | null
  onDismiss: (alert: HTMLElement | null) => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    if (!sticky) {
      node.scrollIntoView?.({ block: 'nearest' })
      return
    }
    // The sticky error must not cover the control that failed: reserve its height at the bottom
    // of the drawer's scroll area and bring that control into view above it, once.
    const scroller = node.closest<HTMLElement>('.mantine-Drawer-content')
    if (!scroller) return
    scroller.style.scrollPaddingBottom = `${node.offsetHeight + 24}px`
    if (trigger && scroller.contains(trigger)) trigger.scrollIntoView?.({ block: 'nearest' })
    return () => {
      scroller.style.scrollPaddingBottom = ''
    }
  }, [sticky, trigger])
  return (
    <Alert
      ref={ref}
      color="red"
      role="alert"
      withCloseButton
      closeButtonLabel={t('action.cancel')}
      onClose={() => onDismiss(ref.current)}
      className="combat-alert"
    >
      {children}
    </Alert>
  )
}

/** Auto-dismisses; hovering, touching or focusing the toast pauses the countdown. */
function FloatingError({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const [paused, setPaused] = useState(false)
  // The parent re-renders on every poll; keep the timer independent of its callback identity.
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => close.current(), toastMs)
    return () => window.clearTimeout(timer)
  }, [paused])
  return (
    <div
      className="combat-toast"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false)
      }}
    >
      {children}
    </div>
  )
}

export function NetworkState({
  stale,
  connected,
  retry,
}: {
  stale: boolean
  connected: boolean
  retry: () => void
}) {
  const { t } = useTranslation()
  if (stale)
    return (
      <Alert
        color="yellow"
        role="status"
        icon={<WifiOff size={18} aria-hidden="true" />}
        className="combat-stale"
      >
        <Group justify="space-between" gap="sm">
          <Text size="sm">{t('combat.network.stale')}</Text>
          <Button size="xs" variant="light" onClick={retry}>
            {t('combat.network.retry')}
          </Button>
        </Group>
      </Alert>
    )
  return (
    <Text size="sm" c="dimmed" className="combat-live" role="status">
      <Radio size={14} aria-hidden="true" />
      {t(connected ? 'combat.network.live' : 'combat.network.polling')}
    </Text>
  )
}

/**
 * Hit points. Exact numbers (the DM, the own character, teammates who share, revealed creatures) get
 * a proportional bar with the numbers and the band word. Everyone else sees only the named band as a
 * seal and a word (RYT-043): no bar, so nothing looks more precise than it is. Never colour alone.
 */
export function HpMeter({
  combatant,
  compact = false,
  large = false,
}: {
  combatant: Combatant
  compact?: boolean
  large?: boolean
}) {
  const { t } = useTranslation()
  const band = healthBand(combatant)
  if (band === null) return null
  // A defeated creature or a dead character says so in the status word itself (one word, icon +
  // text, full contrast) instead of "Down" plus a separate pill (RYT-042 F2).
  const word = combatant.defeated
    ? t(combatant.kind === 'character' ? 'combat.dead' : 'combat.defeated')
    : t(`combat.hp.${band}`)
  const hp = combatant.hp
  if (!hp) return <BandMark band={band} word={word} defeated={combatant.defeated} large={large} />
  const ratio = Math.round((hp.current / Math.max(1, hp.max)) * 100)
  const label = `${t('combat.hp.value', { current: hp.current, max: hp.max })}${
    hp.temp > 0 ? ` ${t('combat.hp.temp', { temp: hp.temp })}` : ''
  }`
  return (
    <div
      className={`combat-hp tone-${combatant.defeated ? 'down' : band}${compact ? ' is-compact' : ''}`}
    >
      <div className="combat-hp-bar" aria-hidden="true">
        <span style={{ width: `${ratio}%` }} />
      </div>
      <Text component="span" className="combat-hp-text">
        {combatant.defeated && <Skull size={14} aria-hidden="true" className="combat-hp-icon" />}
        <span className="combat-hp-value">{label}</span>{' '}
        {/* The band phrase never splits; a narrow row wraps before the dot instead. */}
        <Text component="span" className="combat-hp-status">
          · {word}
        </Text>
      </Text>
    </div>
  )
}

export function ConditionBadges({ combatant, limit }: { combatant: Combatant; limit?: number }) {
  const { t } = useTranslation()
  const conditions = combatant.conditions ?? []
  if (conditions.length === 0 && !combatant.concentration) return null
  const shown = limit ? conditions.slice(0, limit) : conditions
  return (
    <Group gap={4} className="combat-badges">
      {combatant.concentration && (
        <Badge variant="light" color="blue" size="sm" className="combat-badge">
          {t('combat.concentration.on', { spell: combatant.concentration })}
        </Badge>
      )}
      {shown.map((key) => (
        <Badge key={key} variant="outline" size="sm" className="combat-badge">
          {t(`srd.condition.${key}`)}
        </Badge>
      ))}
      {limit && conditions.length > limit && (
        <Badge variant="outline" size="sm" className="combat-badge">
          +{conditions.length - limit}
        </Badge>
      )}
    </Group>
  )
}

export function StateBadge({ combatant }: { combatant: Combatant }): ReactNode {
  const { t } = useTranslation()
  // Defeat is carried by the hit point status word (HpMeter), not by a pill.
  const dying = combatant.kind === 'character' && combatant.hp?.current === 0 && !combatant.defeated
  if (dying && (combatant.death_saves?.successes ?? 0) >= 3)
    return (
      <Badge color="green" variant="light" size="sm">
        {t('combat.stable')}
      </Badge>
    )
  if (combatant.hidden)
    return (
      <Badge color="gray" variant="outline" size="sm">
        {t('combat.hidden')}
      </Badge>
    )
  return null
}

export function Pips({ filled, total, label }: { filled: number; total: number; label: string }) {
  return (
    <span className="combat-pips" role="img" aria-label={label}>
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={index < filled ? 'is-filled' : undefined} />
      ))}
    </span>
  )
}
