import { useState } from 'react'
import { Drawer, Stack, Text, UnstyledButton } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  armorClass,
  attacks,
  canEquip,
  equippedBySlot,
  proficiencyBonus,
  slotsFor,
} from '../domain/equipment'
import {
  equipmentSlots,
  type EquipmentSlot,
  type ItemDefinition,
  type ItemStack,
} from '../domain/item'
import { ItemIcon } from './item-icon'

const slotIcons: Record<EquipmentSlot, string> = {
  head: 'crown',
  neck: 'medal',
  cloak: 'ribbon',
  body: 'shirt',
  hands: 'hand',
  belt: 'link',
  feet: 'footprints',
  ring_1: 'gem',
  ring_2: 'gem',
  main_hand: 'sword',
  off_hand: 'shield',
}
const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`)

export function AttackLines({
  stacks,
  definitions,
  strength,
  dexterity,
  level,
}: {
  stacks: ItemStack[]
  definitions: Map<string, ItemDefinition>
  strength: number
  dexterity: number
  level: number
}) {
  const { t } = useTranslation()
  const lines = attacks(
    { str: strength, dex: dexterity },
    proficiencyBonus(level),
    equippedBySlot(stacks, definitions),
  )
  if (lines.length === 0)
    return (
      <Text size="sm" c="dimmed">
        {t('inventory.attacks.none')}
      </Text>
    )
  return (
    <ul className="attack-lines">
      {lines.map((line) => (
        <li key={line.stackId}>
          <span className="attack-name user-copy">{line.name}</span>
          <span
            className="attack-bonus"
            aria-label={t('inventory.attacks.toHit', { value: signed(line.attack) })}
          >
            {signed(line.attack)}
          </span>
          <span className="attack-damage">
            {line.dice}
            {line.damageBonus ? ` ${signed(line.damageBonus)}` : ''}
            {line.damageType ? ` ${t(`inventory.damage.${line.damageType}`)}` : ''}
            {line.versatileDice
              ? ` · ${t('inventory.attacks.twoHands', { dice: line.versatileDice })}`
              : ''}
            {line.range ? ` · ${line.range} ${t('inventory.card.feet')}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Equipment sockets around the portrait medallion; tapping a socket opens its picker. */
export function PaperDoll({
  stacks,
  definitions,
  dexterity,
  strength,
  level,
  canEdit,
  pending,
  portrait,
  onEquip,
  onUnequip,
}: {
  stacks: ItemStack[]
  definitions: Map<string, ItemDefinition>
  dexterity: number
  strength: number
  level: number
  canEdit: boolean
  pending: boolean
  portrait: React.ReactNode
  onEquip: (stack: ItemStack, slot: EquipmentSlot) => void
  onUnequip: (stack: ItemStack) => void
}) {
  const { t } = useTranslation()
  const phone = useMediaQuery('(max-width: 48em)')
  const [picking, setPicking] = useState<EquipmentSlot | null>(null)
  const equipped = equippedBySlot(stacks, definitions)
  const twoHanded = equipped.get('main_hand')?.definition.slot_kind === 'two_hands'
  const candidates = picking
    ? stacks.filter((stack) => {
        const definition = definitions.get(stack.definition_id)
        return (
          !stack.equipped_slot &&
          stack.quantity > 0 &&
          definition &&
          slotsFor(definition.slot_kind).includes(picking) &&
          canEquip(definition.slot_kind, picking, equipped)
        )
      })
    : []
  const current = picking ? equipped.get(picking) : undefined
  return (
    <div className="paper-doll-view">
      <div className="paper-doll" role="list" aria-label={t('inventory.view.equipment')}>
        <div className="doll-portrait">{portrait}</div>
        {equipmentSlots.map((slot) => {
          const entry = equipped.get(slot)
          const blocked = slot === 'off_hand' && twoHanded
          const label = t(`inventory.slot.${slot}`)
          return (
            <div role="listitem" key={slot} className={`doll-socket socket-${slot}`}>
              <UnstyledButton
                className="socket"
                data-filled={entry ? true : undefined}
                data-blocked={blocked || undefined}
                disabled={!canEdit || pending || blocked}
                aria-label={
                  entry
                    ? t('inventory.socket.filled', { slot: label, name: entry.definition.name })
                    : blocked
                      ? t('inventory.socket.blocked', { slot: label })
                      : t('inventory.socket.empty', { slot: label })
                }
                onClick={() => setPicking(slot)}
              >
                <ItemIcon
                  icon={entry ? entry.definition.icon : blocked ? 'swords' : slotIcons[slot]}
                  size={24}
                />
              </UnstyledButton>
              <span className="socket-label" aria-hidden="true">
                {entry ? entry.definition.name : label}
              </span>
            </div>
          )
        })}
      </div>
      <div className="doll-stats">
        <div
          className="ac-medallion"
          aria-label={t('inventory.ac', { value: armorClass(dexterity, equipped) })}
        >
          <Shield size={56} aria-hidden="true" strokeWidth={1.2} />
          <span aria-hidden="true">{armorClass(dexterity, equipped)}</span>
        </div>
        <div className="doll-attacks">
          <Text fw={600} mb={4}>
            {t('inventory.attacks.title')}
          </Text>
          <AttackLines
            stacks={stacks}
            definitions={definitions}
            strength={strength}
            dexterity={dexterity}
            level={level}
          />
        </div>
      </div>
      {picking && (
        <Drawer
          opened
          onClose={() => setPicking(null)}
          position={phone ? 'bottom' : 'right'}
          size={phone ? 'auto' : 380}
          title={t(`inventory.slot.${picking}`)}
          closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
        >
          <Stack gap="xs">
            {current && (
              <UnstyledButton
                className="picker-row picker-remove"
                disabled={pending}
                onClick={() => {
                  onUnequip(current.stack)
                  setPicking(null)
                }}
              >
                <ItemIcon icon={current.definition.icon} size={22} />
                <span className="user-copy">
                  {t('inventory.socket.unequip', { name: current.definition.name })}
                </span>
              </UnstyledButton>
            )}
            {!current &&
              candidates.map((stack) => {
                const definition = definitions.get(stack.definition_id)!
                return (
                  <UnstyledButton
                    key={stack.id}
                    className="picker-row"
                    disabled={pending}
                    onClick={() => {
                      onEquip(stack, picking)
                      setPicking(null)
                    }}
                  >
                    <ItemIcon icon={definition.icon} size={22} />
                    <span className="user-copy">{definition.name}</span>
                    {stack.quantity > 1 && <span className="picker-count">×{stack.quantity}</span>}
                  </UnstyledButton>
                )
              })}
            {!current && candidates.length === 0 && (
              <Text size="sm" c="dimmed">
                {t('inventory.socket.nothing')}
              </Text>
            )}
          </Stack>
        </Drawer>
      )}
    </div>
  )
}
