import { useId, useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Loader,
  NativeSelect,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  UnstyledButton,
} from '@mantine/core'
import { usePhone } from '@/shared/ui/use-viewport'
import { ViewerButton } from '@/shared/ui/image-viewer'
import { useTranslation } from 'react-i18next'
import { formatPounds } from '../domain/encumbrance'
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
import { categoryIcons, rarityPips } from './item-visuals'
import { Stepper } from './stepper'

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

/** Live card of the item being forged: the one place the editor shows off (RYT-032). */
function ForgePreview({
  draft,
  dm,
  image,
  imagePath,
}: {
  draft: DefinitionDraft
  dm: boolean
  image?: string | null
  imagePath?: string | null
}) {
  const { t, i18n } = useTranslation()
  const p = draft.properties
  const name = draft.name.trim() || t('forge.unnamed')
  const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`
  const facts = [
    draft.category === 'weapon' && p.dice
      ? `${p.dice} ${t(`inventory.damage.${p.damageType ?? 'slashing'}`)}`
      : null,
    draft.category === 'weapon' && p.attackBonus
      ? `${signed(p.attackBonus)} ${t('inventory.forge.attackShort')}`
      : null,
    draft.category === 'weapon' && p.damageBonus
      ? `${signed(p.damageBonus)} ${t('inventory.forge.damageShort')}`
      : null,
    draft.category === 'armor' ? `${t('inventory.card.armor')} ${p.base ?? 10}` : null,
    draft.category === 'shield' ? `+${p.acBonus ?? 2} ${t('inventory.card.shield')}` : null,
    draft.category !== 'shield' && p.acBonus
      ? `${signed(p.acBonus)} ${t('inventory.forge.acShort')}`
      : null,
    p.speedBonus ? `${signed(p.speedBonus)} ${t('inventory.card.feet')}` : null,
    t('forge.weightUnit', { value: formatPounds(draft.weight_tenths / 10, i18n.language) }),
    dm
      ? draft.value_gp === null
        ? t('store.noValue')
        : t('store.value', { value: draft.value_gp.toLocaleString(i18n.language) })
      : null,
  ].filter(Boolean)
  return (
    <section className={`forge-preview rarity-${draft.rarity}`} aria-label={t('forge.preview')}>
      {/* RYT-098: the chosen picture opens the viewer, so it can be checked before saving. */}
      {image ? (
        <ViewerButton
          src={image}
          title={name}
          alt={t('viewer.alt', { name })}
          label={t('viewer.open', { name })}
          className="item-image-open forge-preview-glyph"
        >
          <img src={image} alt="" />
        </ViewerButton>
      ) : (
        <ItemIcon
          icon={draft.icon}
          imagePath={imagePath}
          size={44}
          viewable
          name={name}
          frame="forge-preview-glyph"
        />
      )}
      <span className="forge-preview-body">
        <span className="forge-preview-name user-copy">{name}</span>
        <span className="forge-preview-kind">
          <span className="forge-preview-rarity">{t(`inventory.rarity.${draft.rarity}`)}</span>{' '}
          {t(`inventory.category.${draft.category}`)}
          <span className="item-rarity-pips" aria-hidden="true">
            {'◆'.repeat(rarityPips[draft.rarity])}
          </span>
        </span>
        <span className="forge-preview-facts">
          {facts.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </span>
        {draft.description.trim() && (
          <span className="forge-preview-text user-copy">{draft.description}</span>
        )}
      </span>
    </section>
  )
}

/** The forge: create or edit an item, optionally from an SRD template, then hand it out. */
export function Forge({
  definition,
  media,
  image,
  dm,
  targets,
  initialGive,
  title,
  pending,
  error,
  onSave,
  onClose,
}: {
  definition: ItemDefinition | null
  media?: React.ReactNode
  /** Freshly chosen image (object URL) or null when removed; shown in the live preview. */
  image?: string | null
  dm: boolean
  targets: ForgeTarget[]
  /** Characters preselected to receive a new item (for example "New item for Arin"). */
  initialGive?: string[]
  title?: string
  pending: boolean
  error: string | null
  onSave: (draft: DefinitionDraft, give: { characterIds: string[]; amount: number }) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  const id = useId()
  const [draft, setDraft] = useState<DefinitionDraft>(() =>
    definition ? fromDefinition(definition) : emptyDraft(),
  )
  const [give, setGive] = useState<string[]>(
    () => initialGive ?? (!dm && !definition && targets[0] ? [targets[0].id] : []),
  )
  const [amount, setAmount] = useState<number | null>(1)
  const set = (change: Partial<DefinitionDraft>) =>
    setDraft((current) => ({ ...current, ...change }))
  const setProps = (change: DefinitionDraft['properties']) =>
    setDraft((current) => ({ ...current, properties: { ...current.properties, ...change } }))
  const p = draft.properties
  const diceInvalid = Boolean(p.dice && !/^\d{1,2}d\d{1,3}$/.test(p.dice))
  const valid = draft.name.trim().length > 0 && !diceInvalid
  const imagePath = image === null ? null : definition?.image_path
  const giveBlock = dm && targets.length > 0 && (
    <fieldset className="plain-fieldset">
      <legend>
        <Text fw={600} size="sm">
          {t('inventory.forge.giveTo')}
        </Text>
        {!definition && (
          <Text size="sm" c="dimmed">
            {t('store.giveHint')}
          </Text>
        )}
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
  )
  // A preselected recipient ("New item for Arin") is shown first so the target is obvious.
  const giveFirst = Boolean(initialGive?.length)
  return (
    <Drawer
      returnFocus={false}
      opened
      onClose={onClose}
      position={phone ? 'bottom' : 'right'}
      size={phone ? '92%' : 560}
      title={title ?? t(definition ? 'inventory.forge.editTitle' : 'inventory.forge.title')}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
      className="forge-drawer"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (valid && !pending)
            onSave(
              { ...draft, name: draft.name.trim(), value_gp: dm ? draft.value_gp : null },
              { characterIds: give, amount: amount ?? 1 },
            )
        }}
      >
        <Stack gap="lg">
          <ForgePreview draft={draft} dm={dm} image={image} imagePath={imagePath} />
          {giveFirst && giveBlock}
          {!definition && (
            <Select
              searchable
              placeholder={t('inventory.forge.templatePlaceholder')}
              label={t('inventory.forge.template')}
              description={t(
                dm ? 'inventory.forge.templateHint' : 'inventory.forge.templateHintPlayer',
              )}
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
              <Text fw={600} size="sm" mb={6}>
                {t('inventory.forge.category')}
              </Text>
            </legend>
            <div className="forge-category-grid">
              {itemCategories.map((category) => (
                <label key={category} className="forge-tile">
                  <input
                    type="radio"
                    className="forge-radio"
                    name={`${id}-category`}
                    value={category}
                    checked={draft.category === category}
                    onChange={() =>
                      set({
                        category,
                        slot_kind: defaultSlot[category] ?? 'none',
                        // Keep a custom icon; otherwise follow the category mark.
                        icon:
                          draft.icon === 'package' || draft.icon === categoryIcons[draft.category]
                            ? categoryIcons[category]
                            : draft.icon,
                      })
                    }
                  />
                  <ItemIcon icon={categoryIcons[category]} size={22} />
                  <span>{t(`inventory.category.${category}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="plain-fieldset">
            <legend>
              <Text fw={600} size="sm" mb={6}>
                {t('inventory.forge.rarity')}
              </Text>
            </legend>
            <div className="forge-rarity-row">
              {rarities.map((rarity) => (
                <label key={rarity} className={`forge-swatch rarity-${rarity}`}>
                  <input
                    type="radio"
                    className="forge-radio"
                    name={`${id}-rarity`}
                    value={rarity}
                    checked={draft.rarity === rarity}
                    onChange={() => set({ rarity })}
                  />
                  <span className="forge-gem" aria-hidden="true" />
                  <span className="forge-swatch-label">{t(`inventory.rarity.${rarity}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {media}
          <fieldset className="plain-fieldset">
            <legend>
              <Text fw={600} size="sm" mb={6}>
                {t('inventory.forge.icon')}
              </Text>
            </legend>
            <div className="icon-picker" role="group">
              {iconKeys.map((icon) => (
                <UnstyledButton
                  key={icon}
                  type="button"
                  aria-pressed={draft.icon === icon}
                  aria-label={t('inventory.forge.iconLabel', {
                    icon: t(`inventory.icon.${icon}` as 'inventory.icon.package'),
                  })}
                  className="icon-choice"
                  onClick={() => set({ icon })}
                >
                  <ItemIcon icon={icon} size={22} />
                </UnstyledButton>
              ))}
            </div>
          </fieldset>
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            <Stepper
              label={t('inventory.forge.weight')}
              min={0}
              max={10000}
              step={0.5}
              decimalScale={1}
              value={draft.weight_tenths / 10}
              onChange={(value) => set({ weight_tenths: Math.round((value ?? 0) * 10) })}
            />
            {dm && (
              <Stepper
                label={t('inventory.forge.value')}
                min={0}
                max={100000000}
                placeholder={t('store.noValue')}
                value={draft.value_gp}
                onChange={(value) => set({ value_gp: value })}
              />
            )}
          </SimpleGrid>
          <NativeSelect
            label={t('inventory.forge.slot')}
            value={draft.slot_kind}
            data={slotKinds.map((kind) => ({
              value: kind,
              label: t(`inventory.slotKind.${kind}`),
            }))}
            onChange={(event) => set({ slot_kind: event.currentTarget.value as SlotKind })}
          />
          {draft.category === 'armor' && (
            <fieldset className="plain-fieldset forge-props">
              <legend>
                <Text fw={600} size="sm" mb={6}>
                  {t('forge.properties')}
                </Text>
              </legend>
              <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                <Stepper
                  label={t('inventory.forge.armorBase')}
                  min={0}
                  max={30}
                  value={p.base ?? 10}
                  onChange={(value) => setProps({ base: value ?? undefined })}
                />
                <Stepper
                  label={t('inventory.forge.acBonus')}
                  min={-5}
                  max={10}
                  value={p.acBonus ?? 0}
                  onChange={(value) => setProps({ acBonus: value ? value : undefined })}
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
                  onChange={(event) =>
                    setProps({ stealthDisadvantage: event.currentTarget.checked })
                  }
                />
              </SimpleGrid>
            </fieldset>
          )}
          {draft.category === 'shield' && (
            <Stepper
              label={t('inventory.card.shield')}
              min={0}
              max={10}
              value={p.acBonus ?? 2}
              onChange={(value) => setProps({ acBonus: value ?? undefined })}
            />
          )}
          {draft.category === 'weapon' && (
            <fieldset className="plain-fieldset forge-props">
              <legend>
                <Text fw={600} size="sm" mb={6}>
                  {t('forge.properties')}
                </Text>
              </legend>
              <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                <TextInput
                  label={t('inventory.forge.dice')}
                  placeholder="1d8"
                  value={p.dice ?? ''}
                  error={diceInvalid ? t('inventory.forge.diceError') : undefined}
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
                <Stepper
                  label={t('inventory.forge.attackBonus')}
                  min={-5}
                  max={10}
                  value={p.attackBonus ?? 0}
                  onChange={(value) => setProps({ attackBonus: value ? value : undefined })}
                />
                <Stepper
                  label={t('inventory.forge.damageBonus')}
                  min={-5}
                  max={10}
                  value={p.damageBonus ?? 0}
                  onChange={(value) => setProps({ damageBonus: value ? value : undefined })}
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
            </fieldset>
          )}
          {draft.slot_kind !== 'none' &&
            draft.category !== 'armor' &&
            draft.category !== 'shield' && (
              <fieldset className="plain-fieldset forge-props">
                <legend>
                  <Text fw={600} size="sm" mb={6}>
                    {t('inventory.forge.modifiers')}
                  </Text>
                </legend>
                <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                  <Stepper
                    label={t('inventory.forge.acBonus')}
                    min={-5}
                    max={10}
                    value={p.acBonus ?? 0}
                    onChange={(value) => setProps({ acBonus: value ? value : undefined })}
                  />
                  <Stepper
                    label={t('inventory.forge.speedBonus')}
                    min={-30}
                    max={60}
                    step={5}
                    value={p.speedBonus ?? 0}
                    onChange={(value) => setProps({ speedBonus: value ? value : undefined })}
                  />
                </SimpleGrid>
              </fieldset>
            )}
          <Textarea
            autosize
            minRows={2}
            maxLength={2000}
            label={t('inventory.forge.description')}
            value={draft.description}
            onChange={(event) => set({ description: event.currentTarget.value })}
          />
          {!giveFirst && giveBlock}
          {give.length > 0 && (
            <Stepper
              label={t('inventory.card.amount')}
              min={1}
              max={1000}
              value={amount}
              onChange={setAmount}
            />
          )}
          <div className="forge-dock">
            {error && (
              <Alert color="red" role="alert" mb="xs">
                {error}
              </Alert>
            )}
            <Button
              type="submit"
              size="md"
              fullWidth
              aria-disabled={pending || !valid}
              aria-busy={pending}
              leftSection={pending ? <Loader size={16} /> : undefined}
              disabled={!valid && !pending}
            >
              {t(definition ? 'inventory.forge.save' : 'inventory.forge.create')}
            </Button>
          </div>
        </Stack>
      </form>
    </Drawer>
  )
}
