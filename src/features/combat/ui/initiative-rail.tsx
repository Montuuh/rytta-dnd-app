import { useRef, useState, type MouseEvent, type ReactNode, type TouchEvent } from 'react'
import { ActionIcon, Checkbox, Group, Text, UnstyledButton } from '@mantine/core'
import { ArrowDown, ArrowUp, Crown, Hourglass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLongPress } from '@/shared/ui/use-long-press'
import { moveWithinTie, type Combatant } from '../domain/combat'
import { sideLabel } from './helpers'
import { ConditionBadges, HpMeter, SideIcon, StateBadge } from './parts'
import { CombatantToken } from './token'

type RailMode =
  | { kind: 'read' }
  | {
      kind: 'pick'
      selectedId: string | null
      onPick: (combatant: Combatant) => void
    }
  | {
      kind: 'multi'
      selected: ReadonlySet<string>
      onToggle: (combatant: Combatant) => void
    }

/** Renders a row's action menu (DM). The rail owns which menu is open so a long press or a right
 * click on the row can open the same menu as its visible ⋯ button. */
export type RowMenu = (
  combatant: Combatant,
  control: { opened: boolean; onChange: (opened: boolean) => void },
) => ReactNode

/**
 * Initiative order as an ordered list. The acting combatant carries aria-current="step" and a
 * visible "Acting now" label; status is always text + icon, never color alone.
 */
export function InitiativeRail({
  combatants,
  mode,
  reorder,
  rowMenu,
  rowAction,
  rowExtra,
  large = false,
}: {
  combatants: Combatant[]
  mode: RailMode
  /** DM tie reordering: receives the full new order of ids. */
  reorder?: (ids: string[]) => void
  rowMenu?: RowMenu
  /** One trailing control for a row (the table view's "change my initiative"). */
  rowAction?: (combatant: Combatant) => ReactNode
  /** Full-width content under a row (the table view's own initiative entry). */
  rowExtra?: (combatant: Combatant) => ReactNode
  large?: boolean
}) {
  const { t } = useTranslation()
  const [menuFor, setMenuFor] = useState<string | null>(null)
  if (combatants.length === 0)
    return (
      <Text c="dimmed" className="combat-empty">
        {t('combat.order.empty')}
      </Text>
    )
  return (
    <ol className={`combat-rail${large ? ' is-large' : ''}`} aria-label={t('combat.order.title')}>
      {combatants.map((combatant) => {
        const up = reorder ? moveWithinTie(combatants, combatant.id, -1) : null
        const down = reorder ? moveWithinTie(combatants, combatant.id, 1) : null
        const selected =
          mode.kind === 'pick'
            ? mode.selectedId === combatant.id
            : mode.kind === 'multi'
              ? mode.selected.has(combatant.id)
              : false
        const body = <RowBody combatant={combatant} large={large} />
        const action = rowAction?.(combatant)
        const extra = rowExtra?.(combatant)
        return (
          <li
            key={combatant.id}
            className={[
              'combat-row',
              combatant.is_active ? 'is-active' : '',
              combatant.defeated ? 'is-defeated' : '',
              selected ? 'is-selected' : '',
              combatant.is_own ? 'is-own' : '',
              extra ? 'has-extra' : '',
              `side-${combatant.kind === 'lair' ? 'lair' : combatant.side}`,
            ].join(' ')}
            aria-current={combatant.is_active ? 'step' : undefined}
          >
            {mode.kind === 'pick' ? (
              <PickButton
                combatant={combatant}
                selected={selected}
                onPick={mode.onPick}
                onHold={rowMenu ? () => setMenuFor(combatant.id) : undefined}
              >
                {body}
              </PickButton>
            ) : mode.kind === 'multi' ? (
              <label className="combat-row-main is-check">
                <Checkbox
                  size="md"
                  checked={selected}
                  disabled={combatant.kind === 'lair'}
                  onChange={() => mode.onToggle(combatant)}
                  aria-label={t('combat.select.toggle', { name: combatant.name })}
                />
                {body}
              </label>
            ) : (
              <div className="combat-row-main">{body}</div>
            )}
            {reorder && (up || down) && (
              <div className="combat-row-tie">
                <ActionIcon
                  variant="subtle"
                  size={44}
                  aria-label={t('combat.order.up', { name: combatant.name })}
                  disabled={!up}
                  onClick={() => up && reorder(up)}
                >
                  <ArrowUp size={18} aria-hidden="true" />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size={44}
                  aria-label={t('combat.order.down', { name: combatant.name })}
                  disabled={!down}
                  onClick={() => down && reorder(down)}
                >
                  <ArrowDown size={18} aria-hidden="true" />
                </ActionIcon>
              </div>
            )}
            {rowMenu && mode.kind === 'pick' && (
              <div className="combat-row-actions">
                {rowMenu(combatant, {
                  opened: menuFor === combatant.id,
                  onChange: (opened) =>
                    setMenuFor((current) =>
                      opened ? combatant.id : current === combatant.id ? null : current,
                    ),
                })}
              </div>
            )}
            {action && <div className="combat-row-actions">{action}</div>}
            {extra && <div className="combat-row-extra">{extra}</div>}
          </li>
        )
      })}
    </ol>
  )
}

/** The row's main control. With a menu, holding it (touch) or right-clicking opens that menu;
 * the visible ⋯ button stays the discoverable path. */
function PickButton({
  combatant,
  selected,
  onPick,
  onHold,
  children,
}: {
  combatant: Combatant
  selected: boolean
  onPick: (combatant: Combatant) => void
  onHold?: () => void
  children: ReactNode
}) {
  // After a long press by touch, the release must not produce the browser's compatibility mouse
  // events: their mousedown lands outside the menu that just opened and would close it.
  const held = useRef(false)
  const press = useLongPress(
    () => onPick(combatant),
    () => {
      held.current = true
      onHold?.()
    },
  )
  return (
    <UnstyledButton
      className="combat-row-main"
      aria-pressed={selected}
      id={`combatant-${combatant.id}`}
      {...(onHold
        ? {
            ...press,
            onTouchStart: () => {
              held.current = false
            },
            onTouchEnd: (event: TouchEvent) => {
              if (!held.current) return
              held.current = false
              if (event.cancelable) event.preventDefault()
            },
            onContextMenu: (event: MouseEvent) => {
              event.preventDefault()
              onHold()
            },
          }
        : { onClick: () => onPick(combatant) })}
    >
      {children}
    </UnstyledButton>
  )
}

function RowBody({ combatant, large }: { combatant: Combatant; large: boolean }) {
  const { t } = useTranslation()
  return (
    <>
      <span className="combat-init" title={t('combat.initiative.label')}>
        {combatant.initiative ?? (
          <Hourglass size={16} aria-label={t('combat.initiative.missing')} />
        )}
      </span>
      <CombatantToken combatant={combatant} />
      <span className="combat-row-text">
        <Group gap={6} wrap="nowrap" className="combat-row-title">
          <span className="combat-side-icon" title={sideLabel(t, combatant)}>
            <SideIcon combatant={combatant} size={large ? 22 : 16} />
          </span>
          <Text component="span" fw={700} className="combat-row-name">
            {combatant.name}
          </Text>
          {combatant.is_own && (
            <Text component="span" size="xs" className="combat-you">
              {t('combat.you')}
            </Text>
          )}
          {combatant.legendary && combatant.legendary.max > 0 && (
            <span className="combat-legendary-mini" title={t('combat.legendary')}>
              <Crown size={14} aria-hidden="true" />
              {combatant.legendary.max - combatant.legendary.used}
            </span>
          )}
        </Group>
        <span className="visually-hidden">
          {sideLabel(t, combatant)}
          {combatant.is_active ? `, ${t('combat.turn.current')}` : ''}
        </span>
        {combatant.is_active && (
          <Text component="span" size="xs" fw={700} className="combat-now" aria-hidden="true">
            {t('combat.turn.current')}
          </Text>
        )}
        <HpMeter combatant={combatant} compact={!large} large={large} />
        <Group gap={6} wrap="wrap">
          <StateBadge combatant={combatant} />
          <ConditionBadges combatant={combatant} limit={large ? undefined : 3} />
        </Group>
      </span>
      {combatant.armor_class !== undefined && (
        <span className="combat-ac">{t('combat.ac', { value: combatant.armor_class })}</span>
      )}
    </>
  )
}
