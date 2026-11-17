import type { ReactNode } from 'react'
import { GlossaryTerm, GlossaryText, glossaryIds } from '@/features/glossary'
import { useState } from 'react'
import { Alert, Group, Stack, Text, UnstyledButton } from '@mantine/core'
import { Drawer } from '@/shared/ui/overlays'
import { usePhone } from '@/shared/ui/use-viewport'
import { Gift, Hand, Pencil, Trash2, Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatGp } from '@/shared/lib/money'
import { localizedDescription, localizedName } from '@/shared/lib/translations'
import { slotsFor } from '../domain/equipment'
import { isUsable, unitPounds, type ItemDefinition, type ItemStack } from '../domain/item'
import { useWeightFormat } from './use-weight'
import { HoldSeal } from './hold-seal'
import { ItemIcon } from './item-icon'
import { Stepper } from './stepper'

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
  total,
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
  /** Units of this item in the satchel, across stacks (the tile shows them as one). */
  total: number
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
  const { format } = useWeightFormat()
  const phone = usePhone()
  const [amount, setAmount] = useState<number | null>(1)
  // The DM's field also grants, so it only stops at 1000; a Player can only discard what the stack holds.
  const limit = dm ? 1000 : stack.quantity
  const count = Math.min(amount ?? 1, limit)
  // What "Discard" will take is never more than the stack, so the button says exactly that.
  const discard = Math.min(count, stack.quantity)
  const props = definition.properties
  const name = localizedName(definition, i18n.language)
  const description = localizedDescription(definition, i18n.language)
  const facts: [string, ReactNode][] = [
    [t('inventory.card.weight'), format(unitPounds(definition), 3)],
    [t('inventory.card.category'), t(`inventory.category.${definition.category}`)],
  ]
  // RYT-104: what one unit gives when used, and what a container holds. Units a Player added
  // by themselves never feed supplies or lighten the load, so their card does not promise it.
  if (stack.source !== 'player' && (props.rations || props.water))
    facts.push([
      t('items.supplies.perUnit'),
      [
        props.rations ? t('items.supplies.rationsEach', { count: props.rations }) : null,
        props.water ? t('items.supplies.waterEach', { count: props.water }) : null,
      ]
        .filter(Boolean)
        .join(' · '),
    ])
  if (props.container)
    facts.push([
      t('items.container.holds'),
      props.container.loadReductionPercent
        ? t(
            stack.source === 'player'
              ? 'items.container.holdsUnearned'
              : 'items.container.holdsReduced',
            {
              weight: format(props.container.capacityLb, 1),
              percent: props.container.loadReductionPercent,
            },
          )
        : format(props.container.capacityLb, 1),
    ])
  if (props.base !== undefined)
    facts.push([
      t('inventory.card.armor'),
      props.dexCap === 0
        ? String(props.base)
        : typeof props.dexCap === 'number'
          ? t('inventory.card.armorCapped', { base: props.base, cap: props.dexCap })
          : t('inventory.card.armorDex', { base: props.base }),
    ])
  const signed = (value: number) => `${value > 0 ? '+' : ''}${value}`
  if (props.acBonus !== undefined && (definition.category === 'shield' || props.acBonus !== 0))
    facts.push([
      definition.category === 'shield' ? t('inventory.card.shield') : t('inventory.forge.acBonus'),
      signed(props.acBonus),
    ])
  if (props.attackBonus) facts.push([t('inventory.forge.attackBonus'), signed(props.attackBonus)])
  if (props.damageBonus) facts.push([t('inventory.forge.damageBonus'), signed(props.damageBonus)])
  if (props.speedBonus)
    facts.push([
      t('inventory.forge.speedBonus'),
      `${signed(props.speedBonus)} ${t('inventory.card.feet')}`,
    ])
  if (props.dice)
    facts.push([
      t('inventory.card.damage'),
      <>
        {props.dice}
        {props.versatileDice ? ` (${props.versatileDice})` : ''}
        {props.damageType && (
          <>
            {' '}
            <GlossaryTerm id={glossaryIds.damage(props.damageType)}>
              {t(`inventory.damage.${props.damageType}`)}
            </GlossaryTerm>
          </>
        )}
      </>,
    ])
  // RYT-008: weapon properties link to their SRD rules.
  const properties: [string, string][] = []
  if (props.finesse) properties.push(['finesse', t('inventory.forge.finesse')])
  if (props.thrown) properties.push(['thrown', t('glossary.property.thrown')])
  if (props.versatileDice) properties.push(['versatile', t('glossary.property.versatile')])
  if (definition.slot_kind === 'two_hands' && props.dice)
    properties.push(['two-handed', t('glossary.property.twoHanded')])
  if (properties.length)
    facts.push([
      t('glossary.weaponProperties'),
      properties.map(([key, label], index) => (
        <span key={key}>
          {index > 0 && ', '}
          <GlossaryTerm id={glossaryIds.property(key)}>{label}</GlossaryTerm>
        </span>
      )),
    ])
  if (props.range)
    facts.push([t('inventory.card.range'), `${props.range} ${t('inventory.card.feet')}`])
  if (props.stealthDisadvantage)
    facts.push([
      t('inventory.card.stealth'),
      <GlossaryTerm key="stealth" id="rule.disadvantage">
        {t('inventory.card.disadvantage')}
      </GlossaryTerm>,
    ])
  if (dm && definition.value_gp !== null)
    facts.push([
      t('inventory.card.value'),
      `${formatGp(definition.value_gp, i18n.language)} ${t('inventory.card.gp')}`,
    ])
  const equippable = slotsFor(definition.slot_kind).length > 0
  const usable = isUsable(definition.category)
  return (
    <Drawer
      opened
      onClose={onClose}
      position={phone ? 'bottom' : 'right'}
      size={phone ? 'auto' : 420}
      title={<span className="user-copy">{name}</span>}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
      classNames={{ content: 'item-card-drawer' }}
    >
      <article className={`item-card rarity-${definition.rarity}`} aria-labelledby="item-card-name">
        <header className="item-card-head">
          <ItemIcon
            icon={definition.icon}
            imagePath={definition.image_path}
            category={definition.category}
            size={40}
            viewable
            name={name}
            frame="item-card-icon"
          />
          <div>
            {/* The drawer's title shows the name; this heading names the article for readers. */}
            <h3 id="item-card-name" className="item-card-name user-copy visually-hidden">
              {name}
            </h3>
            <Text size="sm" className="item-card-rarity">
              {t(`inventory.rarity.${definition.rarity}`)} · ×{stack.quantity}
              {total > stack.quantity && ` · ${t('inventory.card.inTotal', { count: total })}`}
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
        {description && (
          <Text size="sm" className="item-card-description user-copy preserve-lines">
            <GlossaryText text={description} />
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
            <UnstyledButton
              className="undo-seal small"
              aria-disabled={pending || undefined}
              onClick={() => !pending && undo.onUndo()}
            >
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
                    name,
                    left: stack.quantity - 1,
                  })}
                  hint={t('inventory.card.holdToUse')}
                  confirmLabel={t('inventory.card.useNow')}
                  disabled={pending}
                  onConfirm={actions.use}
                >
                  <ItemIcon icon={definition.icon} imagePath={definition.image_path} size={26} />
                  <span>{t('inventory.card.use')}</span>
                </HoldSeal>
              )}
              {equippable && (
                <UnstyledButton
                  className="socket-action"
                  aria-disabled={pending || undefined}
                  onClick={() => !pending && actions.equip()}
                >
                  <span className="socket-ring" aria-hidden="true">
                    <Hand size={22} />
                  </span>
                  <span>{t('inventory.card.equip')}</span>
                </UnstyledButton>
              )}
            </Group>
            {(dm || stack.quantity > 1) && (
              <div className="item-card-amount">
                <Stepper
                  label={t(dm ? 'inventory.card.amount' : 'inventory.card.discardCount')}
                  min={1}
                  max={limit}
                  required
                  longPress
                  value={Math.min(amount ?? 1, limit)}
                  maxMessage={
                    dm
                      ? undefined
                      : t(
                          total > stack.quantity
                            ? 'inventory.card.onlyInStack'
                            : 'inventory.card.onlyHave',
                          {
                            count: stack.quantity,
                          },
                        )
                  }
                  onChange={setAmount}
                />
                {stack.quantity > 1 && (
                  <UnstyledButton
                    className="quiet-link item-card-all"
                    aria-disabled={pending || undefined}
                    onClick={() => setAmount(stack.quantity)}
                  >
                    {t('inventory.card.all', { count: stack.quantity })}
                  </UnstyledButton>
                )}
              </div>
            )}
            <Group justify="space-between" gap="xs" className="item-card-links">
              <UnstyledButton
                className="quiet-link danger"
                aria-disabled={pending || undefined}
                onClick={() => !pending && actions.remove(discard)}
              >
                <Trash2 size={16} aria-hidden="true" />
                {t('inventory.card.discard', { amount: discard })}
              </UnstyledButton>
              {dm && (
                <UnstyledButton
                  className="quiet-link"
                  aria-disabled={pending || undefined}
                  onClick={() => !pending && actions.grant(count)}
                >
                  <Gift size={16} aria-hidden="true" />
                  {t('inventory.card.giveMore', { amount: count })}
                </UnstyledButton>
              )}
              {dm && (
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
