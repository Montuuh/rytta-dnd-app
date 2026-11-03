import { ActionIcon, Button, Group, Menu, Modal, Stack, Text, VisuallyHidden } from '@mantine/core'
import { Dice5, Ellipsis, Play, UserMinus, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { joinPlacement, type Combatant } from '../domain/combat'

/**
 * RYT-041 roster changes. A row's ⋯ menu (also opened by a long press or a right click on the row)
 * holds the DM's per-combatant actions; removal always goes through a confirmation that says what
 * happens to the turn.
 */
export function RowActions({
  combatant,
  opened,
  onChange,
  onJump,
  onInitiative,
  onRemove,
}: {
  combatant: Combatant
  opened: boolean
  onChange: (opened: boolean) => void
  /** Present when the turn can be handed to this combatant. */
  onJump?: () => void
  onInitiative: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  return (
    <Menu opened={opened} onChange={onChange} position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          size={44}
          className="combat-row-menu"
          aria-label={t('combat.row.menu', { name: combatant.name })}
        >
          <Ellipsis size={20} aria-hidden="true" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown className="combat-menu">
        {onJump && (
          <Menu.Item leftSection={<Play size={16} aria-hidden="true" />} onClick={onJump}>
            {t('combat.turn.jump', { name: combatant.name })}
          </Menu.Item>
        )}
        <Menu.Item leftSection={<Dice5 size={16} aria-hidden="true" />} onClick={onInitiative}>
          {t('combat.row.initiative')}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          color="red"
          leftSection={<UserMinus size={16} aria-hidden="true" />}
          onClick={onRemove}
        >
          {t('combat.row.remove')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

/** Confirms a removal and states its consequence for the turn and the character. */
export function RemoveCombatantDialog({
  combatant,
  next,
  pending,
  close,
  confirm,
}: {
  combatant: Combatant
  /** Who takes the turn when the active combatant leaves. */
  next: Combatant | null
  pending: boolean
  close: () => void
  confirm: () => void
}) {
  const { t } = useTranslation()
  return (
    <Modal
      opened
      onClose={close}
      title={t('combat.remove.title', { name: combatant.name })}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <Stack gap="xs">
        {combatant.is_active && (
          <Text fw={700}>
            {next ? t('combat.remove.active', { next: next.name }) : t('combat.remove.activeAlone')}
          </Text>
        )}
        <Text>
          {t(combatant.kind === 'character' ? 'combat.remove.character' : 'combat.remove.npc')}
        </Text>
      </Stack>
      <Group justify="flex-end" mt="md">
        <Button variant="subtle" onClick={close}>
          {t('action.cancel')}
        </Button>
        <Button
          color="red"
          variant="light"
          loading={pending}
          leftSection={<UserMinus size={16} aria-hidden="true" />}
          onClick={confirm}
        >
          {t('combat.row.remove')}
        </Button>
      </Group>
    </Modal>
  )
}

/** Where a character joining mid-combat lands: its neighbours in the order and when it acts. */
export function JoinPreview({
  combatants,
  name,
  total,
  round,
}: {
  combatants: readonly Combatant[]
  name: string
  total: number | null
  round: number
}) {
  const { t } = useTranslation()
  if (total === null) return null
  const place = joinPlacement(combatants, total)
  const neighbour = (combatant: Combatant | null) =>
    combatant && (
      <li>
        <span className="combat-join-init">{combatant.initiative ?? '–'}</span>
        <span className="combat-join-name">{combatant.name}</span>
      </li>
    )
  return (
    <div className="combat-join">
      <ol className="combat-join-order" aria-label={t('combat.join.preview')}>
        {neighbour(place.before)}
        <li className="is-new">
          <span className="combat-join-init">{total}</span>
          <span className="combat-join-name">
            <UserPlus size={16} aria-hidden="true" /> {name}
            <VisuallyHidden>, {t('combat.join.here')}</VisuallyHidden>
          </span>
        </li>
        {neighbour(place.after)}
      </ol>
      <Text size="sm" fw={600} aria-live="polite">
        {place.thisRound && place.before
          ? t('combat.join.thisRound', { name: place.before.name })
          : t('combat.join.nextRound', { round: round + 1 })}
      </Text>
    </div>
  )
}
