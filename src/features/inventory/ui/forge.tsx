import { useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Group,
  NativeSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  UnstyledButton,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useTranslation } from 'react-i18next'
import {
  itemCategories,
  rarities,
  slotKinds,
  type DefinitionDraft,
  type ItemCategory,
  type ItemDefinition,
  type SlotKind,
} from '../domain/item'
import { srdEquipment } from '../domain/srd-equipment'
import { iconKeys } from './icons'
import { ItemIcon } from './item-icon'

export type ForgeTarget = { id: string; name: string; portrait: React.ReactNode }
const defaultSlot: Partial<Record<ItemCategory, SlotKind>> = {
  weapon: 'one_hand',
  armor: 'body',
  shield: 'shield',
}
const emptyDraft = (): DefinitionDraft => ({
  name: '',
  category: 'gear',
  icon: 'package',
  rarity: 'common',
  weight_tenths: 0,
  value_gp: null,
  description: '',
  slot_kind: 'none',
  properties: {},
})
const fromDefinition = (definition: ItemDefinition): DefinitionDraft => ({
  name: definition.name,
  category: definition.category,
  icon: definition.icon,
  rarity: definition.rarity,
  weight_tenths: definition.weight_tenths,
  value_gp: definition.value_gp,
  description: definition.description,
  slot_kind: definition.slot_kind,
  properties: definition.properties,
})
const num = (value: number | string) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

/** The forge: create or edit an item, optionally from an SRD template, then hand it out. */
export function Forge({
  definition,
  dm,
  targets,
  pending,
  error,
  onSave,
  onClose,
}: {
  definition: ItemDefinition | null
  dm: boolean
  targets: ForgeTarget[]
  pending: boolean
  error: string | null
  onSave: (draft: DefinitionDraft, give: { characterIds: string[]; amount: number }) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const phone = useMediaQuery('(max-width: 48em)')
  const [draft, setDraft] = useState<DefinitionDraft>(() =>
    definition ? fromDefinition(definition) : emptyDraft(),
  )
  const [give, setGive] = useState<string[]>(() =>
    !dm && !definition && targets[0] ? [targets[0].id] : [],
  )
  const [amount, setAmount] = useState<number | string>(1)
  const set = (change: Partial<DefinitionDraft>) =>
    setDraft((current) => ({ ...current, ...change }))
  const setProps = (change: DefinitionDraft['properties']) =>
    setDraft((current) => ({ ...current, properties: { ...current.properties, ...change } }))
  const valid = draft.name.trim().length > 0
  const p = draft.properties
  return (
    <Drawer
      opened
      onClose={onClose}
      position={phone ? 'bottom' : 'right'}
      size={phone ? '92%' : 480}
      title={t(definition ? 'inventory.forge.editTitle' : 'inventory.forge.title')}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (valid && !pending)
            onSave(
              { ...draft, name: draft.name.trim(), value_gp: dm ? draft.value_gp : null },
              { characterIds: give, amount: num(amount) ?? 1 },
            )
        }}
      >
        <Stack gap="md">
          {!definition && (
            <Select
              searchable
              label={t('inventory.forge.template')}
              description={t('inventory.forge.templateHint')}
              data={srdEquipment.map((item) => ({
                value: item.key,
                label: t(`srdItem.${item.key}` as 'srdItem.dagger'),
              }))}
              onChange={(key) => {
                const template = srdEquipment.find((item) => item.key === key)
                if (!template) return
                const { key: templateKey, ...rest } = template
                setDraft({
                  ...emptyDraft(),
                  ...rest,
                  value_gp: dm ? rest.value_gp : null,
                  name: t(`srdItem.${templateKey}` as 'srdItem.dagger'),
                  origin: dm ? 'srd' : undefined,
                })
              }}
            />
          )}
          <TextInput
            required
            data-autofocus
            maxLength={100}
            label={t('inventory.forge.name')}
            value={draft.name}
            onChange={(event) => set({ name: event.currentTarget.value })}
          />
          <fieldset className="plain-fieldset">
            <legend>
              <Text fw={600} size="sm">
                {t('inventory.forge.category')}
              </Text>
            </legend>
            <div className="category-rail wrap" role="group">
              {itemCategories.map((category) => (
                <UnstyledButton
                  key={category}
                  type="button"
                  aria-pressed={draft.category === category}
                  className="category-chip"
                  onClick={() => set({ category, slot_kind: defaultSlot[category] ?? 'none' })}
                >
                  <span>{t(`inventory.category.${category}`)}</span>
                </UnstyledButton>
              ))}
            </div>
          </fieldset>
          <fieldset className="plain-fieldset">
            <legend>
              <Text fw={600} size="sm">
                {t('inventory.forge.icon')}
              </Text>
            </legend>
            <div className="icon-picker" role="group">
              {iconKeys.map((icon) => (
                <UnstyledButton
                  key={icon}
                  type="button"
                  aria-pressed={draft.icon === icon}
                  aria-label={t('inventory.forge.iconLabel', { icon })}
                  className="icon-choice"
                  onClick={() => set({ icon })}
                >
                  <ItemIcon icon={icon} size={22} />
                </UnstyledButton>
              ))}
            </div>
          </fieldset>
          <SimpleGrid cols={2} spacing="sm">
            <NativeSelect
              label={t('inventory.forge.rarity')}
              value={draft.rarity}
              data={rarities.map((rarity) => ({
                value: rarity,
                label: t(`inventory.rarity.${rarity}`),
              }))}
              onChange={(event) =>
                set({ rarity: event.currentTarget.value as DefinitionDraft['rarity'] })
              }
            />
            <NativeSelect
              label={t('inventory.forge.slot')}
              value={draft.slot_kind}
              data={slotKinds.map((kind) => ({
                value: kind,
                label: t(`inventory.slotKind.${kind}`),
              }))}
              onChange={(event) => set({ slot_kind: event.currentTarget.value as SlotKind })}
            />
            <NumberInput
              label={t('inventory.forge.weight')}
              min={0}
              max={10000}
              decimalScale={1}
              hideControls
              value={draft.weight_tenths / 10}
              onChange={(value) => set({ weight_tenths: Math.round((num(value) ?? 0) * 10) })}
            />
            {dm && (
              <NumberInput
                label={t('inventory.forge.value')}
                min={0}
                max={100000000}
                allowDecimal={false}
                hideControls
                value={draft.value_gp ?? ''}
                onChange={(value) => set({ value_gp: num(value) ?? null })}
              />
            )}
          </SimpleGrid>
          {draft.category === 'armor' && (
            <SimpleGrid cols={2} spacing="sm">
              <NumberInput
                label={t('inventory.forge.armorBase')}
                min={0}
                max={30}
                allowDecimal={false}
                hideControls
                value={p.base ?? 10}
                onChange={(value) => setProps({ base: num(value) })}
              />
              <NativeSelect
                label={t('inventory.forge.dexCap')}
                value={p.dexCap === null || p.dexCap === undefined ? 'none' : String(p.dexCap)}
                data={[
                  { value: 'none', label: t('inventory.forge.dexFull') },
                  { value: '2', label: '+2' },
                  { value: '0', label: t('inventory.forge.dexNone') },
                ]}
                onChange={(event) =>
                  setProps({
                    dexCap:
                      event.currentTarget.value === 'none'
                        ? null
                        : Number(event.currentTarget.value),
                  })
                }
              />
              <Checkbox
                label={t('inventory.card.stealth')}
                checked={p.stealthDisadvantage ?? false}
                onChange={(event) => setProps({ stealthDisadvantage: event.currentTarget.checked })}
              />
            </SimpleGrid>
          )}
          {draft.category === 'shield' && (
            <NumberInput
              label={t('inventory.card.shield')}
              min={0}
              max={10}
              allowDecimal={false}
              hideControls
              value={p.acBonus ?? 2}
              onChange={(value) => setProps({ acBonus: num(value) })}
            />
          )}
          {draft.category === 'weapon' && (
            <SimpleGrid cols={2} spacing="sm">
              <TextInput
                label={t('inventory.forge.dice')}
                placeholder="1d8"
                value={p.dice ?? ''}
                error={
                  p.dice && !/^\d{1,2}d\d{1,3}$/.test(p.dice)
                    ? t('inventory.forge.diceError')
                    : undefined
                }
                onChange={(event) => setProps({ dice: event.currentTarget.value || undefined })}
              />
              <NativeSelect
                label={t('inventory.forge.damageType')}
                value={p.damageType ?? 'slashing'}
                data={(['bludgeoning', 'piercing', 'slashing'] as const).map((type) => ({
                  value: type,
                  label: t(`inventory.damage.${type}`),
                }))}
                onChange={(event) =>
                  setProps({
                    damageType: event.currentTarget.value as
                      'bludgeoning' | 'piercing' | 'slashing',
                  })
                }
              />
              <Checkbox
                label={t('inventory.forge.finesse')}
                checked={p.finesse ?? false}
                onChange={(event) => setProps({ finesse: event.currentTarget.checked })}
              />
              <Checkbox
                label={t('inventory.forge.ranged')}
                checked={p.ranged ?? false}
                onChange={(event) => setProps({ ranged: event.currentTarget.checked })}
              />
            </SimpleGrid>
          )}
          <Textarea
            autosize
            minRows={2}
            maxLength={2000}
            label={t('inventory.forge.description')}
            value={draft.description}
            onChange={(event) => set({ description: event.currentTarget.value })}
          />
          {dm && targets.length > 0 && (
            <fieldset className="plain-fieldset">
              <legend>
                <Text fw={600} size="sm">
                  {t('inventory.forge.giveTo')}
                </Text>
              </legend>
              <div className="give-roster" role="group">
                {targets.map((target) => (
                  <UnstyledButton
                    key={target.id}
                    type="button"
                    aria-pressed={give.includes(target.id)}
                    className="give-target"
                    onClick={() =>
                      setGive((current) =>
                        current.includes(target.id)
                          ? current.filter((id) => id !== target.id)
                          : [...current, target.id],
                      )
                    }
                  >
                    {target.portrait}
                    <span className="user-copy">{target.name}</span>
                  </UnstyledButton>
                ))}
              </div>
            </fieldset>
          )}
          {give.length > 0 && (
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
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button type="submit" loading={pending} disabled={!valid}>
              {t(definition ? 'inventory.forge.save' : 'inventory.forge.create')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Drawer>
  )
}
