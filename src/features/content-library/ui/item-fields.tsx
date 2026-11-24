import { Checkbox, NumberInput, Select, Textarea, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import {
  categoryIconDefaults,
  itemCategories,
  packItemIndexSchema,
  rarities,
  slotKinds,
} from '@/features/inventory'
import { descriptionLimit } from '@/shared/lib/translations'
import { bodyOf, indexOf } from '../domain/forms'
import type { ContentLanguage, EntryInput } from '../domain/library'

type Data = Record<string, unknown>
const masteries = ['cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex'] as const
const damageTypes = ['bludgeoning', 'piercing', 'slashing'] as const
const armorTypes = ['light', 'medium', 'heavy'] as const
const weaponFlags = ['finesse', 'light', 'heavy', 'reach', 'thrown', 'loading', 'ranged'] as const
const dicePattern = /^\d{1,2}d\d{1,3}$/
const rangePattern = /^\d{1,4}\/\d{1,4}$/

const unset = 'unset'

/** A choice that may stay empty: "Not set" is an option, so no small clear button is needed. */
function OptionalSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: string; label: string }[]
  value: unknown
  onChange: (value: string | undefined) => void
}) {
  const { t } = useTranslation()
  const current = options.find((option) => option.value === value)?.value ?? unset
  return (
    <Select
      label={label}
      data={[{ value: unset, label: t('library.item.unset') }, ...options]}
      value={current}
      allowDeselect={false}
      onChange={(next) => onChange(next && next !== unset ? next : undefined)}
    />
  )
}

const num = (value: unknown) => (typeof value === 'number' ? value : '')
const str = (value: unknown) => (typeof value === 'string' ? value : '')

/**
 * RYT-166 (owner choice P4 A): an item's mechanics, as the storeroom, inventories and shops use
 * them: category, weight, price, where it is worn, damage, armour and the common properties.
 * Fields this form does not show (lots, containers, rations) stay as they are in the JSON tab.
 */
export function ItemFields({
  entry,
  onChange,
}: {
  entry: EntryInput
  onChange: (next: EntryInput) => void
}) {
  const { t } = useTranslation()
  const index = indexOf(entry.data)
  const properties: Data =
    index.properties && typeof index.properties === 'object' && !Array.isArray(index.properties)
      ? (index.properties as Data)
      : {}
  const category = itemCategories.find((value) => value === index.category) ?? null
  const setIndex = (patch: Data) => {
    const next: Data = { ...index, ...patch }
    for (const [key, value] of Object.entries(next)) if (value === undefined) delete next[key]
    onChange({ ...entry, data: { ...entry.data, index: next } })
  }
  const setProps = (patch: Data) => {
    const next: Data = { ...properties, ...patch }
    for (const [key, value] of Object.entries(next))
      if (value === undefined || value === '' || value === false) delete next[key]
    setIndex({ properties: next })
  }
  const setDescription = (language: ContentLanguage, description: string) => {
    const body: Data = { ...(bodyOf(entry.data, language) ?? {}) }
    if (description) body.description = description
    else delete body.description
    const data: Data = { ...entry.data }
    if (Object.keys(body).length) data[language] = body
    else delete data[language]
    onChange({ ...entry, data })
  }
  const check = packItemIndexSchema.safeParse(index)
  const invalid = new Set(
    check.success ? [] : check.error.issues.map((issue) => issue.path.join('.')),
  )
  const weight = typeof index.weightLb === 'number' ? index.weightLb : ''
  const price = typeof index.costCp === 'number' ? index.costCp / 100 : ''
  const required = t('library.item.required')
  return (
    <>
      <div className="lib-grid-fields">
        <Select
          label={t('inventory.forge.category')}
          required
          data={itemCategories.map((value) => ({
            value,
            label: t(`inventory.category.${value}`),
          }))}
          value={category}
          error={invalid.has('category') ? required : undefined}
          onChange={(value) => {
            const next = itemCategories.find((item) => item === value)
            if (!next) return
            const icon =
              index.icon === undefined || index.icon === categoryIconDefaults[category ?? next]
            setIndex({ category: next, ...(icon ? { icon: categoryIconDefaults[next] } : {}) })
          }}
        />
        <Select
          label={t('inventory.forge.slot')}
          data={slotKinds.map((value) => ({ value, label: t(`inventory.slotKind.${value}`) }))}
          value={slotKinds.find((value) => value === index.slot_kind) ?? 'none'}
          onChange={(value) => setIndex({ slot_kind: value ?? 'none' })}
        />
        <Select
          label={t('inventory.forge.rarity')}
          data={rarities.map((value) => ({ value, label: t(`inventory.rarity.${value}`) }))}
          value={rarities.find((value) => value === index.rarity) ?? 'common'}
          onChange={(value) =>
            setIndex({ rarity: value && value !== 'common' ? value : undefined })
          }
        />
        <NumberInput
          label={t('library.item.weight')}
          min={0}
          max={10000}
          decimalScale={3}
          hideControls
          value={weight}
          onChange={(value) =>
            setIndex({ weightLb: typeof value === 'number' ? value : undefined })
          }
        />
        <NumberInput
          label={t('library.item.price')}
          min={0}
          max={1_000_000}
          decimalScale={2}
          hideControls
          value={price}
          onChange={(value) =>
            setIndex({
              costCp: typeof value === 'number' ? Math.round(value * 100) : undefined,
            })
          }
        />
      </div>
      {category === 'weapon' && (
        <fieldset className="plain-fieldset lib-item-group">
          <legend className="lib-item-legend">{t('library.item.weapon')}</legend>
          <div className="lib-grid-fields">
            <TextInput
              label={t('inventory.forge.dice')}
              value={str(properties.dice)}
              error={
                properties.dice && !dicePattern.test(str(properties.dice))
                  ? t('inventory.forge.diceError')
                  : undefined
              }
              onChange={(event) => setProps({ dice: event.currentTarget.value.trim() })}
            />
            <TextInput
              label={t('library.item.versatile')}
              value={str(properties.versatileDice)}
              error={
                properties.versatileDice && !dicePattern.test(str(properties.versatileDice))
                  ? t('inventory.forge.diceError')
                  : undefined
              }
              onChange={(event) => setProps({ versatileDice: event.currentTarget.value.trim() })}
            />
            <OptionalSelect
              label={t('inventory.forge.damageType')}
              options={damageTypes.map((value) => {
                const name = t(`inventory.damage.${value}`)
                return { value, label: name.charAt(0).toUpperCase() + name.slice(1) }
              })}
              value={properties.damageType}
              onChange={(damageType) => setProps({ damageType })}
            />
            <TextInput
              label={t('library.item.range')}
              value={str(properties.range)}
              error={
                properties.range && !rangePattern.test(str(properties.range))
                  ? t('library.item.rangeError')
                  : undefined
              }
              onChange={(event) => setProps({ range: event.currentTarget.value.trim() })}
            />
            <OptionalSelect
              label={t('library.item.proficiency')}
              options={(['simple', 'martial'] as const).map((value) => ({
                value,
                label: t(`library.item.proficiency.${value}`),
              }))}
              value={properties.proficiency}
              onChange={(proficiency) => setProps({ proficiency })}
            />
            <OptionalSelect
              label={t('library.item.mastery')}
              options={masteries.map((value) => ({
                value,
                label: t(`library.item.mastery.${value}`),
              }))}
              value={properties.mastery}
              onChange={(mastery) => setProps({ mastery })}
            />
          </div>
          <div className="lib-checks">
            {weaponFlags.map((flag) => (
              <Checkbox
                key={flag}
                label={t(`library.item.flag.${flag}`)}
                checked={properties[flag] === true}
                onChange={(event) => setProps({ [flag]: event.currentTarget.checked })}
              />
            ))}
          </div>
        </fieldset>
      )}
      {(category === 'armor' || category === 'shield') && (
        <fieldset className="plain-fieldset lib-item-group">
          <legend className="lib-item-legend">{t('library.item.armor')}</legend>
          <div className="lib-grid-fields">
            {category === 'armor' ? (
              <>
                <NumberInput
                  label={t('inventory.forge.armorBase')}
                  min={0}
                  max={30}
                  hideControls
                  value={num(properties.base)}
                  onChange={(value) =>
                    setProps({ base: typeof value === 'number' ? value : undefined })
                  }
                />
                <OptionalSelect
                  label={t('library.item.armorType')}
                  options={armorTypes.map((value) => ({
                    value,
                    label: t(`library.item.armorType.${value}`),
                  }))}
                  value={properties.armorType}
                  onChange={(armorType) => setProps({ armorType })}
                />
                <NumberInput
                  label={t('library.item.dexCap')}
                  description={t('library.item.dexCapHint')}
                  min={0}
                  max={10}
                  hideControls
                  value={num(properties.dexCap)}
                  onChange={(value) =>
                    setProps({ dexCap: typeof value === 'number' ? value : undefined })
                  }
                />
                <NumberInput
                  label={t('library.item.strength')}
                  min={0}
                  max={30}
                  hideControls
                  value={num(properties.strReq)}
                  onChange={(value) =>
                    setProps({ strReq: typeof value === 'number' ? value : undefined })
                  }
                />
              </>
            ) : (
              <NumberInput
                label={t('inventory.forge.acBonus')}
                min={-5}
                max={10}
                hideControls
                value={num(properties.acBonus)}
                onChange={(value) =>
                  setProps({ acBonus: typeof value === 'number' ? value : undefined })
                }
              />
            )}
          </div>
          {category === 'armor' && (
            <div className="lib-checks">
              <Checkbox
                label={t('library.item.stealth')}
                checked={properties.stealthDisadvantage === true}
                onChange={(event) => setProps({ stealthDisadvantage: event.currentTarget.checked })}
              />
            </div>
          )}
        </fieldset>
      )}
      {(['es', 'en'] as const).map((language) => (
        <Textarea
          key={language}
          label={t(language === 'es' ? 'library.item.descriptionEs' : 'library.item.descriptionEn')}
          maxLength={descriptionLimit}
          autosize
          minRows={3}
          maxRows={16}
          value={str(bodyOf(entry.data, language)?.description)}
          onChange={(event) => setDescription(language, event.currentTarget.value)}
        />
      ))}
    </>
  )
}
