import { useId, useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Collapse,
  Combobox,
  Loader,
  NativeSelect,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  UnstyledButton,
  useCombobox,
} from '@mantine/core'
import { Drawer } from '@/shared/ui/overlays'
import { useDebouncedValue } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Languages, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { formatGp } from '@/shared/lib/money'
import { localizedDescription, localizedName, type Translations } from '@/shared/lib/translations'
import { fromPounds, toPounds } from '@/shared/lib/weight'
import { usePhone } from '@/shared/ui/use-viewport'
import { ViewerButton } from '@/shared/ui/image-viewer'
import { catalogueSearchQuery } from '../api'
import { draftFrom, rankStartingPoints, type CatalogueItem } from '../domain/catalogue'
import {
  itemCategories,
  rarities,
  slotKinds,
  unitPounds,
  type DefinitionDraft,
  type ItemCategory,
  type ItemDefinition,
  type SlotKind,
} from '../domain/item'
import { GpInput, WeightFields } from './amount-fields'
import { iconKeys } from './icons'
import { ItemIcon } from './item-icon'
import { categoryIcons, rarityPips } from './item-visuals'
import { Stepper } from './stepper'
import { useWeightFormat } from './use-weight'
import './catalogue.css'

export type ForgeTarget = { id: string; name: string; portrait: React.ReactNode }
/** What the forge hands back besides the draft: recipients and amount, or the proposal extras. */
export type ForgeExtra = { characterIds: string[]; amount: number; suggestedGp: number | null }
type Language = 'en' | 'es'

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
  weight_lb: 0,
  value_gp: null,
  description: '',
  translations: null,
  slot_kind: 'none',
  properties: {},
})
const fromDefinition = (definition: ItemDefinition): DefinitionDraft => ({
  name: definition.name,
  category: definition.category,
  icon: definition.icon,
  rarity: definition.rarity,
  weight_lb: unitPounds(definition),
  value_gp: definition.value_gp,
  description: definition.description,
  translations: definition.translations ?? null,
  slot_kind: definition.slot_kind,
  properties: definition.properties,
})

type Texts = { name: string; description: string; otherName: string; otherDescription: string }
/**
 * The reader edits the text of their language; the other language is the optional second one.
 * An item first written in the other language keeps that text as its second language.
 */
function splitTexts(draft: DefinitionDraft, language: Language): Texts {
  const other: Language = language === 'en' ? 'es' : 'en'
  const record = { ...draft, translations: draft.translations ?? null }
  const own = record.translations?.[language]
  const second = record.translations?.[other]
  return {
    name: localizedName(record, language),
    description: localizedDescription(record, language),
    otherName: second?.name ?? (own ? draft.name : ''),
    otherDescription: second?.description ?? (own ? draft.description : ''),
  }
}
function joinTexts(texts: Texts, language: Language): Translations {
  const other: Language = language === 'en' ? 'es' : 'en'
  if (!texts.otherName.trim()) return null
  return {
    [language]: { name: texts.name.trim(), description: texts.description },
    [other]: { name: texts.otherName.trim(), description: texts.otherDescription },
  }
}

/** Live card of the item being forged: the one place the editor shows off (RYT-032). */
function ForgePreview({
  draft,
  name,
  description,
  priced,
  image,
  imagePath,
}: {
  draft: DefinitionDraft
  name: string
  description: string
  priced: number | null | undefined
  image?: string | null
  imagePath?: string | null
}) {
  const { t, i18n } = useTranslation()
  const { format } = useWeightFormat()
  const p = draft.properties
  const shown = name.trim() || t('forge.unnamed')
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
    p.rations ? t('items.supplies.rationsEach', { count: p.rations }) : null,
    p.water ? t('items.supplies.waterEach', { count: p.water }) : null,
    p.container?.loadReductionPercent
      ? t('items.container.reductionShort', { percent: p.container.loadReductionPercent })
      : null,
    format(draft.weight_lb, 3),
    priced === undefined
      ? null
      : priced === null
        ? t('store.noValue')
        : t('store.value', { value: formatGp(priced, i18n.language) }),
  ].filter(Boolean)
  return (
    <section className={`forge-preview rarity-${draft.rarity}`} aria-label={t('forge.preview')}>
      {/* RYT-098: the chosen picture opens the viewer, so it can be checked before saving. */}
      {image ? (
        <ViewerButton
          src={image}
          title={shown}
          alt={t('viewer.alt', { name: shown })}
          label={t('viewer.open', { name: shown })}
          className="item-image-open forge-preview-glyph"
        >
          <img src={image} alt="" />
        </ViewerButton>
      ) : (
        <ItemIcon
          icon={draft.icon}
          imagePath={imagePath}
          category={draft.category}
          size={44}
          viewable
          name={shown}
          frame="forge-preview-glyph"
        />
      )}
      <span className="forge-preview-body">
        <span className="forge-preview-name user-copy">{shown}</span>
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
        {description.trim() && <span className="forge-preview-text user-copy">{description}</span>}
      </span>
    </section>
  )
}

/**
 * RYT-104: "Start from an existing item" searches the campaign catalogue; items the DM marked as
 * templates come first, then basic catalogue items. Results stay in the drawer's scroll flow as
 * the software keyboard resizes the viewport.
 */
function StartingPoint({
  campaignId,
  onPick,
}: {
  campaignId: string
  onPick: (item: CatalogueItem) => void
}) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState('')
  const [debounced] = useDebouncedValue(query, 250)
  const list = useCombobox({ onDropdownClose: () => list.resetSelectedOption() })
  const search = useQuery({
    ...catalogueSearchQuery(state.user?.id ?? 'anon', campaignId, debounced, 60),
    enabled: Boolean(state.user) && list.dropdownOpened,
  })
  const matches = rankStartingPoints(search.data ?? [], i18n.language)
  const label = t('items.start.label')
  return (
    <Combobox
      store={list}
      onOptionSubmit={(id) => {
        const item = matches.find((entry) => entry.id === id)
        if (!item) return
        setChosen(localizedName(item, i18n.language))
        setQuery('')
        list.closeDropdown()
        onPick(item)
      }}
    >
      <div>
        <Combobox.EventsTarget withExpandedAttribute>
          <TextInput
            label={label}
            description={t('items.start.hint')}
            placeholder={t('items.start.placeholder')}
            value={list.dropdownOpened ? query : chosen}
            rightSection={search.isFetching ? <Loader size={16} /> : undefined}
            onClick={() => list.openDropdown()}
            onFocus={() => list.openDropdown()}
            onBlur={() => {
              list.closeDropdown()
              setQuery('')
            }}
            onChange={(event) => {
              setQuery(event.currentTarget.value)
              list.resetSelectedOption()
              list.openDropdown()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('')
              if (event.key === 'Enter' && list.dropdownOpened) event.preventDefault()
            }}
          />
        </Combobox.EventsTarget>
        {list.dropdownOpened && (
          <Combobox.Options aria-label={label} className="forge-template-options">
            {search.isError && (
              <Combobox.Option value="" disabled>
                {t('query.error')}
              </Combobox.Option>
            )}
            {search.isPending && !search.data && (
              <Combobox.Option value="" disabled>
                {t('common.loading')}
              </Combobox.Option>
            )}
            {matches.map((item) => (
              <Combobox.Option key={item.id} value={item.id} className="start-option">
                <ItemIcon icon={item.icon} size={18} />
                <span className="start-option-name user-copy">
                  {localizedName(item, i18n.language)}
                </span>
                <span className="start-option-kind">
                  {item.is_template
                    ? t('items.start.template')
                    : t(`inventory.category.${item.category}`)}
                </span>
              </Combobox.Option>
            ))}
            {search.data && matches.length === 0 && (
              <Combobox.Option value="" disabled>
                {t('store.noResults')}
              </Combobox.Option>
            )}
          </Combobox.Options>
        )}
      </div>
    </Combobox>
  )
}

/**
 * The forge: create or edit an item (DM), optionally from an existing one, then hand it out; or,
 * for a Player, describe a new item for the DM to review (`proposal`, RYT-105).
 */
export function Forge({
  campaignId,
  definition,
  initial,
  initialName,
  media,
  image,
  mode,
  targets,
  initialGive,
  initialAmount = 1,
  amountLabel,
  title,
  submitLabel,
  pending,
  error,
  onSave,
  onClose,
}: {
  campaignId: string
  definition: ItemDefinition | null
  /** A draft to start from, e.g. a Player's proposal under review. */
  initial?: DefinitionDraft
  /** Name of a new item, e.g. the text searched without results. */
  initialName?: string
  media?: React.ReactNode
  /** Freshly chosen image (object URL) or null when removed; shown in the live preview. */
  image?: string | null
  mode: 'dm' | 'proposal'
  targets: ForgeTarget[]
  /** Characters preselected to receive a new item (for example "New item for Arin"). */
  initialGive?: string[]
  initialAmount?: number
  /** Always show the amount stepper with this label (a proposal under review). */
  amountLabel?: string
  title?: string
  submitLabel?: string
  pending: boolean
  error: string | null
  onSave: (draft: DefinitionDraft, extra: ForgeExtra) => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const language: Language = i18n.language.startsWith('en') ? 'en' : 'es'
  const other: Language = language === 'en' ? 'es' : 'en'
  const dm = mode === 'dm'
  const phone = usePhone()
  const id = useId()
  const { unit } = useWeightFormat()
  const [draft, setDraft] = useState<DefinitionDraft>(
    () =>
      initial ??
      (definition
        ? fromDefinition(definition)
        : { ...emptyDraft(), name: initialName?.trim().slice(0, 100) ?? '' }),
  )
  const [texts, setTexts] = useState<Texts>(() => splitTexts(draft, language))
  const [secondOpen, setSecondOpen] = useState(() => Boolean(texts.otherName))
  const [moreOpen, setMoreOpen] = useState(false)
  const [give, setGive] = useState<string[]>(() => initialGive ?? [])
  const [amount, setAmount] = useState<number | null>(initialAmount)
  const [suggested, setSuggested] = useState<number | null>(null)
  const set = (change: Partial<DefinitionDraft>) =>
    setDraft((current) => ({ ...current, ...change }))
  const setText = (change: Partial<Texts>) => setTexts((current) => ({ ...current, ...change }))
  const setProps = (change: DefinitionDraft['properties']) =>
    setDraft((current) => ({ ...current, properties: { ...current.properties, ...change } }))
  const p = draft.properties
  const diceInvalid = Boolean(p.dice && !/^\d{1,2}d\d{1,3}$/.test(p.dice))
  const valid = texts.name.trim().length > 0 && !diceInvalid
  const imagePath = image === null ? null : definition?.image_path
  const otherLabel = t(other === 'en' ? 'items.language.en' : 'items.language.es')
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
  const container = p.container
  return (
    <Drawer
      returnFocus={false}
      opened
      onClose={onClose}
      position={phone ? 'bottom' : 'right'}
      size={phone ? '92%' : 560}
      title={
        title ??
        t(
          !dm
            ? 'items.propose.title'
            : definition
              ? 'inventory.forge.editTitle'
              : 'inventory.forge.title',
        )
      }
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
      className="forge-drawer"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid || pending) return
          onSave(
            {
              ...draft,
              name: texts.name.trim(),
              description: texts.description,
              translations: joinTexts(texts, language),
              value_gp: dm ? draft.value_gp : null,
            },
            {
              characterIds: give,
              amount: amount ?? 1,
              suggestedGp: dm ? null : suggested,
            },
          )
        }}
      >
        <Stack gap="lg">
          <ForgePreview
            draft={draft}
            name={texts.name}
            description={texts.description}
            priced={dm ? draft.value_gp : suggested === null ? undefined : suggested}
            image={image}
            imagePath={imagePath}
          />
          {giveFirst && giveBlock}
          {dm && !definition && !initial && (
            <StartingPoint
              campaignId={campaignId}
              onPick={(item) => {
                const next = draftFrom(item, true)
                setDraft(next)
                const split = splitTexts(next, language)
                setTexts(split)
                if (split.otherName) setSecondOpen(true)
              }}
            />
          )}
          <TextInput
            required
            data-autofocus
            maxLength={100}
            label={t('inventory.forge.name')}
            value={texts.name}
            onChange={(event) => setText({ name: event.currentTarget.value })}
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
          {/* J3-19: a proposal starts short (name, kind, description, how many); the rest is one tap away. */}
          {!dm && (
            <UnstyledButton
              type="button"
              className="forge-second-toggle"
              aria-expanded={moreOpen}
              aria-controls={`${id}-more`}
              onClick={() => setMoreOpen((open) => !open)}
            >
              <SlidersHorizontal size={18} aria-hidden="true" />
              <span className="forge-second-copy">
                <span className="forge-second-title">{t('items.propose.more')}</span>
                <span className="forge-second-hint">{t('items.propose.moreHint')}</span>
              </span>
              <ChevronDown size={18} aria-hidden="true" className="forge-second-chevron" />
            </UnstyledButton>
          )}
          <Collapse expanded={dm || moreOpen} id={`${id}-more`}>
            <Stack gap="lg">
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
              <WeightFields
                label={t('items.weight.each')}
                pounds={draft.weight_lb}
                onChange={(weight_lb) => set({ weight_lb })}
              />
              {dm ? (
                <GpInput
                  withSteps
                  label={t('inventory.forge.value')}
                  placeholder={t('store.noValue')}
                  value={draft.value_gp}
                  onChange={(value_gp) => set({ value_gp })}
                />
              ) : (
                <GpInput
                  withSteps
                  label={t('items.propose.suggested')}
                  description={t('items.propose.suggestedHint')}
                  placeholder={t('items.propose.noSuggestion')}
                  value={suggested}
                  onChange={setSuggested}
                />
              )}
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
                      value={
                        p.dexCap === null || p.dexCap === undefined ? 'none' : String(p.dexCap)
                      }
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
                      onChange={(event) =>
                        setProps({ dice: event.currentTarget.value || undefined })
                      }
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
              {draft.category === 'consumable' && (
                <fieldset className="plain-fieldset forge-props">
                  <legend>
                    <Text fw={600} size="sm">
                      {t('items.supplies.title')}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {t('items.supplies.hint')}
                    </Text>
                  </legend>
                  <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" mt={6}>
                    <Stepper
                      label={t('items.supplies.rations')}
                      min={0}
                      max={100}
                      step={0.5}
                      decimalScale={1}
                      value={p.rations ?? 0}
                      onChange={(value) => setProps({ rations: value ? value : undefined })}
                    />
                    <Stepper
                      label={t('items.supplies.water')}
                      min={0}
                      max={100}
                      step={0.5}
                      decimalScale={1}
                      value={p.water ?? 0}
                      onChange={(value) => setProps({ water: value ? value : undefined })}
                    />
                  </SimpleGrid>
                </fieldset>
              )}
              {draft.category === 'gear' && (
                <fieldset className="plain-fieldset forge-props">
                  <legend className="visually-hidden-live">{t('items.container.title')}</legend>
                  <Switch
                    size="md"
                    label={t('items.container.toggle')}
                    description={t('items.container.hint')}
                    checked={Boolean(container)}
                    onChange={(event) =>
                      setProps({
                        container: event.currentTarget.checked
                          ? { capacityLb: 30, loadReductionPercent: 0 }
                          : undefined,
                      })
                    }
                  />
                  {container && (
                    <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" mt="sm">
                      <Stepper
                        label={t(
                          unit === 'kg'
                            ? 'items.container.capacityKg'
                            : 'items.container.capacityLb',
                        )}
                        min={0}
                        max={unit === 'kg' ? 5000 : 10000}
                        step={unit === 'kg' ? 5 : 10}
                        decimalScale={3}
                        value={fromPounds(container.capacityLb, unit)}
                        onChange={(value) =>
                          setProps({
                            container: { ...container, capacityLb: toPounds(value ?? 0, unit) },
                          })
                        }
                      />
                      <Stepper
                        label={t('items.container.reduction')}
                        min={0}
                        max={90}
                        step={5}
                        suffix=" %"
                        value={container.loadReductionPercent}
                        onChange={(value) =>
                          setProps({
                            container: {
                              ...container,
                              loadReductionPercent: Math.round(value ?? 0),
                            },
                          })
                        }
                      />
                    </SimpleGrid>
                  )}
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
            </Stack>
          </Collapse>
          <Textarea
            autosize
            minRows={2}
            maxLength={2000}
            label={t('inventory.forge.description')}
            value={texts.description}
            onChange={(event) => setText({ description: event.currentTarget.value })}
          />
          <div className="forge-second">
            <UnstyledButton
              type="button"
              className="forge-second-toggle"
              aria-expanded={secondOpen}
              aria-controls={`${id}-second`}
              onClick={() => setSecondOpen((open) => !open)}
            >
              <Languages size={18} aria-hidden="true" />
              <span className="forge-second-copy">
                <span className="forge-second-title">
                  {t('items.language.toggle', { language: otherLabel })}
                </span>
                <span className="forge-second-hint">
                  {texts.otherName.trim()
                    ? texts.otherName
                    : t('items.language.hint', { language: otherLabel })}
                </span>
              </span>
              <ChevronDown size={18} aria-hidden="true" className="forge-second-chevron" />
            </UnstyledButton>
            <Collapse expanded={secondOpen} id={`${id}-second`}>
              <Stack gap="sm" pt="sm">
                <TextInput
                  maxLength={100}
                  lang={other}
                  label={t('items.language.name', { language: otherLabel })}
                  value={texts.otherName}
                  onChange={(event) => setText({ otherName: event.currentTarget.value })}
                />
                <Textarea
                  autosize
                  minRows={2}
                  maxLength={2000}
                  lang={other}
                  label={t('items.language.description', { language: otherLabel })}
                  description={t('items.language.needsName')}
                  value={texts.otherDescription}
                  onChange={(event) => setText({ otherDescription: event.currentTarget.value })}
                />
              </Stack>
            </Collapse>
          </div>
          {!giveFirst && giveBlock}
          {(give.length > 0 || !dm || amountLabel) && (
            <Stepper
              label={amountLabel ?? t(dm ? 'inventory.card.amount' : 'items.propose.quantity')}
              min={1}
              max={1000}
              required
              longPress
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
            {/* J3-19: a disabled submit says what is missing, next to the button. */}
            {!valid && !pending && (
              <Text size="sm" c="dimmed" mb="xs" role="status">
                {t(diceInvalid ? 'inventory.forge.diceError' : 'forge.nameNeeded')}
              </Text>
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
              {submitLabel ??
                t(
                  !dm
                    ? 'items.propose.send'
                    : definition
                      ? 'inventory.forge.save'
                      : 'inventory.forge.create',
                )}
            </Button>
          </div>
        </Stack>
      </form>
    </Drawer>
  )
}
