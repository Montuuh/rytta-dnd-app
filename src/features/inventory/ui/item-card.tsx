import { useState } from 'react'
import { Alert, Drawer, Group, NumberInput, Stack, Text, UnstyledButton } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { Gift, Hand, Pencil, Trash2, Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatPounds } from '../domain/encumbrance'
import { slotsFor } from '../domain/equipment'
import { isUsable, type ItemDefinition, type ItemStack } from '../domain/item'
import { HoldSeal } from './hold-seal'
import { ItemIcon } from './item-icon'

export type CardActions = {
  use: () => void
  remove: (amount: number) => void
  equip: () => void
  grant: (amount: number) => void
  edit: () => void
}

/** The parchment "trading card" for one stack. Actions are seals and quiet links, not buttons. */
export function ItemCard({
  stack,
  definition,
  canEdit,
  dm,
  pending,
  actions,
  error,
  undo,
  onClose,
}: {
  stack: ItemStack
  definition: ItemDefinition
  canEdit: boolean
  dm: boolean
  pending: boolean
  actions: CardActions
  error: string | null
  undo: { message: string; onUndo: () => void } | null
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const phone = useMediaQuery('(max-width: 48em)')
  const [amount, setAmount] = useState<number | string>(1)
  const count = typeof amount === 'number' && amount >= 1 ? Math.trunc(amount) : 1
  const props = definition.properties
  const facts: [string, string][] = [
    [
      t('inventory.card.weight'),
      `${formatPounds(definition.weight_tenths / 10, i18n.language)} lb`,
    ],
    [t('inventory.card.category'), t(`inventory.category.${definition.category}`)],
  ]
  if (props.base !== undefined)
    facts.push([
      t('inventory.card.armor'),
      props.dexCap === 0
        ? String(props.base)
        : typeof props.dexCap === 'number'
          ? t('inventory.card.armorCapped', { base: props.base, cap: props.dexCap })
          : t('inventory.card.armorDex', { base: props.base }),
    ])
  if (props.acBonus !== undefined) facts.push([t('inventory.card.shield'), `+${props.acBonus}`])
  if (props.dice)
    facts.push([
      t('inventory.card.damage'),
      `${props.dice}${props.versatileDice ? ` (${props.versatileDice})` : ''}${props.damageType ? ` ${t(`inventory.damage.${props.damageType}`)}` : ''}`,
    ])
  if (props.range)
    facts.push([t('inventory.card.range'), `${props.range} ${t('inventory.card.feet')}`])
  if (props.stealthDisadvantage)
    facts.push([t('inventory.card.stealth'), t('inventory.card.disadvantage')])
  if (dm && definition.value_gp !== null)
    facts.push([t('inventory.card.value'), `${definition.value_gp} ${t('inventory.card.gp')}`])
  const equippable = slotsFor(definition.slot_kind).length > 0
  const usable = isUsable(definition.category)
  return (
    <Drawer
      opened
      onClose={onClose}
      position={phone ? 'bottom' : 'right'}
      size={phone ? 'auto' : 420}
      title={t('inventory.card.title')}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
      classNames={{ content: 'item-card-drawer' }}
    >
      <article className={`item-card rarity-${definition.rarity}`} aria-labelledby="item-card-name">
        <header className="item-card-head">
          <span className="item-card-icon">
            <ItemIcon icon={definition.icon} size={40} />
          </span>
          <div>
            <h3 id="item-card-name" className="item-card-name user-copy">
              {definition.name}
            </h3>
            <Text size="sm" className="item-card-rarity">
              {t(`inventory.rarity.${definition.rarity}`)} · ×{stack.quantity}
            </Text>
          </div>
        </header>
        <dl className="item-card-facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {definition.description && (
          <Text size="sm" className="item-card-description user-copy preserve-lines">
            {definition.description}
          </Text>
        )}
        {error && (
          <Alert color="red" role="alert" mb="sm">
            {error}
          </Alert>
        )}
        {undo && (
          <div className="card-undo" role="status">
            <Text size="sm" className="user-copy">
              {undo.message}
            </Text>
            <UnstyledButton className="undo-seal small" disabled={pending} onClick={undo.onUndo}>
              <Undo2 size={16} aria-hidden="true" />
              {t('inventory.undo.action')}
            </UnstyledButton>
          </div>
        )}
        {canEdit && (
          <Stack gap="md" className="item-card-actions">
            <Group justify="center" gap="xl">
              {usable && (
                <HoldSeal
                  label={t('inventory.card.useLabel', {
                    name: definition.name,
                    left: stack.quantity - 1,
                  })}
                  hint={t('inventory.card.holdToUse')}
                  confirmLabel={t('inventory.card.useNow')}
                  disabled={pending}
                  onConfirm={actions.use}
                >
                  <ItemIcon icon={definition.icon} size={26} />
                  <span>{t('inventory.card.use')}</span>
                </HoldSeal>
              )}
              {equippable && (
                <UnstyledButton
                  className="socket-action"
                  disabled={pending}
                  onClick={actions.equip}
                >
                  <span className="socket-ring" aria-hidden="true">
                    <Hand size={22} />
                  </span>
                  <span>{t('inventory.card.equip')}</span>
                </UnstyledButton>
              )}
            </Group>
            {(dm || stack.quantity > 1) && (
              <NumberInput
                label={t('inventory.card.amount')}
                min={1}
                max={1000}
                allowDecimal={false}
                allowNegative={false}
                hideControls
                value={amount}
                onChange={setAmount}
              />
            )}
            <Group justify="space-between" gap="xs" className="item-card-links">
              <UnstyledButton
                className="quiet-link danger"
                disabled={pending || count > stack.quantity}
                onClick={() => actions.remove(count)}
              >
                <Trash2 size={16} aria-hidden="true" />
                {t('inventory.card.discard', { amount: count })}
              </UnstyledButton>
              {dm && (
                <UnstyledButton
                  className="quiet-link"
                  disabled={pending}
                  onClick={() => actions.grant(count)}
                >
                  <Gift size={16} aria-hidden="true" />
                  {t('inventory.card.giveMore', { amount: count })}
                </UnstyledButton>
              )}
              {(dm || definition.origin === 'player') && (
                <UnstyledButton className="quiet-link" onClick={actions.edit}>
                  <Pencil size={16} aria-hidden="true" />
                  {t('inventory.card.edit')}
                </UnstyledButton>
              )}
            </Group>
          </Stack>
        )}
      </article>
    </Drawer>
  )
}
