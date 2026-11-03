import { useMemo, type ReactNode } from 'react'
import { Alert, Badge, Button, Group, Portal, Text } from '@mantine/core'
import { Castle, Radio, Shield, Skull, Users, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Combatant, CombatErrorCode } from '../domain/combat'
import { statusTone } from './helpers'

/** The body of the topmost open dialog or drawer, if any (nested ones portal last). */
function topDialogBody() {
  const bodies = document.querySelectorAll<HTMLElement>('.mantine-Modal-body, .mantine-Drawer-body')
  return bodies[bodies.length - 1] ?? null
}

/**
 * Action errors are never silent: inside an open dialog or drawer they appear next to its
 * actions; otherwise they float (top on tablets, above the turn bar and navigation on phones).
 */
export function RunnerError({
  error,
  onClose,
}: {
  error: CombatErrorCode | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  // Resolved once per error: the dialog that was open when the write failed.
  const host = useMemo(() => (error ? topDialogBody() : null), [error])
  if (!error) return null
  const alert = (
    <Alert
      ref={(node) => node?.scrollIntoView?.({ block: 'nearest' })}
      color="red"
      role="alert"
      withCloseButton
      closeButtonLabel={t('action.cancel')}
      onClose={onClose}
      className="combat-alert"
    >
      {t(`combat.error.${error}`)}
    </Alert>
  )
  return (
    <Portal target={host ?? undefined}>
      <div className={host ? 'combat-inline-error' : 'combat-toast'}>{alert}</div>
    </Portal>
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

export function SideIcon({ combatant, size = 18 }: { combatant: Combatant; size?: number }) {
  const Icon =
    combatant.kind === 'lair'
      ? Castle
      : combatant.side === 'party'
        ? Shield
        : combatant.side === 'ally'
          ? Users
          : Skull
  return <Icon size={size} aria-hidden="true" />
}

/** Hit points as numbers when visible, otherwise a descriptive status. Never color alone. */
export function HpMeter({
  combatant,
  compact = false,
}: {
  combatant: Combatant
  compact?: boolean
}) {
  const { t } = useTranslation()
  if (combatant.kind === 'lair') return null
  const status = combatant.hp_status ?? 'unknown'
  const tone = statusTone(status)
  const hp = combatant.hp
  const ratio = hp ? Math.round((hp.current / Math.max(1, hp.max)) * 100) : null
  const label = hp
    ? `${t('combat.hp.value', { current: hp.current, max: hp.max })}${
        hp.temp > 0 ? ` ${t('combat.hp.temp', { temp: hp.temp })}` : ''
      }`
    : t(`combat.hp.${status}`)
  return (
    <div className={`combat-hp tone-${tone}${compact ? ' is-compact' : ''}`}>
      <div className="combat-hp-bar" aria-hidden="true">
        <span
          style={{
            width: `${ratio ?? (status === 'down' ? 0 : status === 'unknown' ? 100 : status === 'unhurt' ? 100 : status === 'wounded' ? 70 : 35)}%`,
          }}
        />
      </div>
      <Text component="span" className="combat-hp-text">
        {label}
        {hp && status !== 'unknown' && (
          <Text component="span" className="combat-hp-status">
            {' · '}
            {t(`combat.hp.${status}`)}
          </Text>
        )}
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
  const dying = combatant.kind === 'character' && combatant.hp?.current === 0 && !combatant.defeated
  if (combatant.defeated)
    return (
      <Badge color="gray" variant="filled" size="sm">
        {t(combatant.kind === 'character' ? 'combat.dead' : 'combat.defeated')}
      </Badge>
    )
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
