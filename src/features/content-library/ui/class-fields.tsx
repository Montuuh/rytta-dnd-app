import { Checkbox, NumberInput, Select, Textarea, TextInput } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { classIndexSchema, classKeys } from '@/features/characters'
import { indexOf } from '../domain/forms'
import type { EntryInput } from '../domain/library'

type Data = Record<string, unknown>
const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
const skills = [
  'acrobatics',
  'animalHandling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleightOfHand',
  'stealth',
  'survival',
] as const
const casters = ['none', 'full', 'half', 'pact'] as const
const dice = ['6', '8', '10', '12'] as const
const keyPattern = /^(?:[0-9a-f]{8}--)?[a-z0-9]+(?:-[a-z0-9]+)*$/
const other = 'other'
type ClassErrorKey =
  | 'library.classes.chooseError'
  | 'library.classes.savesError'
  | 'library.classes.numberError'
  | 'library.classes.levelError'
  | 'library.classes.levelsError'
  | 'library.classes.skillsError'

const numbers = (text: string) =>
  text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
const listText = (value: unknown) => (Array.isArray(value) ? value.join(', ') : '')

/**
 * RYT-168: a class or subclass reference: one of the SRD classes, or another class by its key (a
 * class of the same pack, or `<ref>--<key>` of another pack).
 */
export function ClassReferenceField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  const { t } = useTranslation()
  const srd = (classKeys as readonly string[]).includes(value ?? '')
  const [typing, setTyping] = useState(Boolean(value) && !srd)
  const choice = srd ? value! : typing ? other : null
  return (
    <>
      <Select
        label={label}
        data={[
          ...classKeys.map((key) => ({
            value: key,
            label: t(`srd.class.${key}` as 'srd.class.wizard'),
          })),
          { value: other, label: t('library.classes.other') },
        ]}
        value={choice}
        allowDeselect={false}
        onChange={(next) => {
          if (next === other) {
            setTyping(true)
            onChange(srd ? undefined : value)
          } else {
            setTyping(false)
            onChange(next ?? undefined)
          }
        }}
      />
      {choice === other && (
        <TextInput
          label={t('library.classes.key')}
          description={t('library.classes.keyHint')}
          value={value ?? ''}
          error={value && !keyPattern.test(value) ? t('library.problem.key') : undefined}
          onChange={(event) => onChange(event.currentTarget.value.trim() || undefined)}
        />
      )}
    </>
  )
}

/** RYT-168: a class's table: what creation and level up read. */
export function ClassFields({
  entry,
  onChange,
  revealed = false,
}: {
  entry: EntryInput
  onChange: (next: EntryInput) => void
  /** A save was refused: empty fields that block it are marked too. */
  revealed?: boolean
}) {
  const { t } = useTranslation()
  const index = indexOf(entry.data)
  const setIndex = (patch: Data) => {
    const next: Data = { ...index, ...patch }
    for (const [key, value] of Object.entries(next)) if (value === undefined) delete next[key]
    onChange({ ...entry, data: { ...entry.data, index: next } })
  }
  const saves = Array.isArray(index.saves) ? (index.saves as string[]) : []
  const caster = casters.find((value) => value === index.caster) ?? 'none'
  const anySkill = index.skills === 'any'
  const skillList = Array.isArray(index.skills) ? (index.skills as string[]) : []
  const ability = (value: string) => t(`srd.ability.${value}` as 'srd.ability.str')
  const [improvements, setImprovements] = useState(listText(index.improvementLevels))
  const [prepared, setPrepared] = useState(listText(index.prepared))
  const preparedList = numbers(prepared)
  // Each field names its own problem, so a refused save always points at what to fix.
  const check = classIndexSchema.safeParse(index)
  const invalid = new Set(check.success ? [] : check.error.issues.map((issue) => issue.path[0]))
  // Errors show on fields the DM filled, and on every blocking field once a save was refused.
  const error = (field: string, key: ClassErrorKey) =>
    invalid.has(field) && (revealed || index[field] !== undefined) ? t(key) : undefined
  return (
    <>
      <div className="lib-grid-fields">
        <Select
          label={t('library.classes.hitDie')}
          required
          data={dice.map((value) => ({ value, label: `d${value}` }))}
          value={dice.find((value) => Number(value) === index.hitDie) ?? null}
          error={error('hitDie', 'library.classes.chooseError')}
          onChange={(value) => setIndex({ hitDie: value ? Number(value) : undefined })}
        />
        {[0, 1].map((at) => (
          <Select
            key={at}
            label={t(at === 0 ? 'library.classes.save1' : 'library.classes.save2')}
            required
            data={abilities.map((value) => ({
              value,
              label: ability(value),
              disabled: saves[1 - at] === value,
            }))}
            value={abilities.find((value) => value === saves[at]) ?? null}
            error={error('saves', 'library.classes.savesError')}
            onChange={(value) => {
              const next = [saves[0] ?? '', saves[1] ?? '']
              next[at] = value ?? ''
              setIndex({ saves: next })
            }}
          />
        ))}
        <NumberInput
          label={t('library.classes.skillCount')}
          required
          error={error('skillCount', 'library.classes.numberError')}
          min={0}
          max={8}
          hideControls
          value={typeof index.skillCount === 'number' ? index.skillCount : ''}
          onChange={(value) =>
            setIndex({ skillCount: typeof value === 'number' ? value : undefined })
          }
        />
        <NumberInput
          label={t('library.classes.subclassLevel')}
          min={1}
          max={20}
          hideControls
          value={typeof index.subclassLevel === 'number' ? index.subclassLevel : 3}
          error={error('subclassLevel', 'library.classes.levelError')}
          onChange={(value) =>
            setIndex({ subclassLevel: typeof value === 'number' ? value : undefined })
          }
        />
        <TextInput
          label={t('library.classes.improvements')}
          description={t('library.classes.levelsHint')}
          error={error('improvementLevels', 'library.classes.levelsError')}
          value={improvements}
          onChange={(event) => {
            const text = event.currentTarget.value
            setImprovements(text)
            setIndex({ improvementLevels: numbers(text) })
          }}
        />
      </div>
      <fieldset className="plain-fieldset lib-item-group">
        <legend className="lib-item-legend">{t('library.classes.skills')}</legend>
        <Checkbox
          label={t('library.classes.anySkill')}
          checked={anySkill}
          onChange={(event) =>
            setIndex({ skills: event.currentTarget.checked ? 'any' : skillList })
          }
        />
        {!anySkill && (
          <Checkbox.Group
            value={skillList}
            onChange={(value) => setIndex({ skills: value })}
            aria-label={t('library.classes.skills')}
            error={error('skills', 'library.classes.skillsError')}
          >
            <div className="lib-class-grid">
              {skills.map((value) => (
                <Checkbox
                  key={value}
                  value={value}
                  label={t(`srd.skill.${value}` as 'srd.skill.arcana')}
                />
              ))}
            </div>
          </Checkbox.Group>
        )}
      </fieldset>
      <fieldset className="plain-fieldset lib-item-group">
        <legend className="lib-item-legend">{t('library.classes.spellcasting')}</legend>
        <div className="lib-grid-fields">
          <Select
            label={t('library.classes.caster')}
            data={casters.map((value) => ({
              value,
              label: t(`srd.caster.${value}` as 'srd.caster.full'),
            }))}
            value={caster}
            allowDeselect={false}
            onChange={(value) =>
              setIndex(
                value === 'none'
                  ? { caster: 'none', spellAbility: null, prepared: null, cantrips: false }
                  : { caster: value ?? 'none' },
              )
            }
          />
          {caster !== 'none' && (
            <Select
              label={t('library.classes.spellAbility')}
              required
              data={abilities.map((value) => ({ value, label: ability(value) }))}
              value={abilities.find((value) => value === index.spellAbility) ?? null}
              error={error('spellAbility', 'library.classes.chooseError')}
              onChange={(value) => setIndex({ spellAbility: value ?? null })}
            />
          )}
        </div>
        {caster !== 'none' && (
          <>
            <Textarea
              autosize
              minRows={2}
              label={t('library.classes.prepared')}
              description={t('library.classes.preparedHint')}
              value={prepared}
              error={
                prepared.trim() && preparedList.length !== 20
                  ? t('library.classes.preparedError', { count: preparedList.length })
                  : undefined
              }
              onChange={(event) => {
                const text = event.currentTarget.value
                setPrepared(text)
                setIndex({ prepared: text.trim() ? numbers(text) : null })
              }}
            />
            <div className="lib-checks">
              <Checkbox
                label={t('library.classes.cantrips')}
                checked={index.cantrips === true}
                onChange={(event) => setIndex({ cantrips: event.currentTarget.checked })}
              />
            </div>
          </>
        )}
      </fieldset>
    </>
  )
}

/** RYT-168: a subclass names its class (an SRD class or one of its own pack). */
export function SubclassFields({
  entry,
  onChange,
}: {
  entry: EntryInput
  onChange: (next: EntryInput) => void
}) {
  const { t } = useTranslation()
  const index = indexOf(entry.data)
  return (
    <div className="lib-grid-fields">
      <ClassReferenceField
        label={t('library.class')}
        value={typeof index.class === 'string' ? index.class : undefined}
        onChange={(value) => {
          const next: Data = { ...index, class: value }
          if (value === undefined) delete next.class
          onChange({ ...entry, data: { ...entry.data, index: next } })
        }}
      />
    </div>
  )
}
