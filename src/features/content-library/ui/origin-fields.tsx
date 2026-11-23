import {
  ActionIcon,
  Button,
  Checkbox,
  NumberInput,
  Select,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  backgroundIndexSchema,
  classKeys,
  featCategories,
  featIndexSchema,
  speciesIndexSchema,
  speciesSizes,
} from '@/features/characters'
import { draftsQuery, libraryQuery } from '../api'
import { indexOf } from '../domain/forms'
import { srdSlug } from '../domain/srd'
import { keyFromName, type EntryInput } from '../domain/library'

/**
 * RYT-171 (owner choice P3 A): the tables of a species, a background and a feat, as creation reads
 * them. Their texts are the pack's own features: `species-<species>-<trait>` and `feat-<feat>`.
 */
type Data = Record<string, unknown>
type Named = { key: string; en: string; es: string }
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
const kebab = (key: string) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

function useIndex(entry: EntryInput, onChange: (next: EntryInput) => void) {
  const index = indexOf(entry.data)
  const setIndex = (patch: Data) => {
    const next: Data = { ...index, ...patch }
    for (const [key, value] of Object.entries(next)) if (value === undefined) delete next[key]
    onChange({ ...entry, data: { ...entry.data, index: next } })
  }
  return [index, setIndex] as const
}
const namedList = (value: unknown): Named[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Named =>
          Boolean(item) && typeof item === 'object' && typeof (item as Named).key === 'string',
      )
    : []
/** Option lines as typed: «español | inglés», one per line. */
const optionLines = (options: Named[]) =>
  options.map((option) => (option.en ? `${option.es} | ${option.en}` : option.es)).join('\n')
function parseOptions(text: string): Named[] {
  const options: Named[] = []
  for (const line of text.split('\n')) {
    const [es = '', en = ''] = line.split('|').map((part) => part.trim())
    if (!es && !en) continue
    const key = keyFromName(en || es) || `option-${options.length + 1}`
    if (options.some((option) => option.key === key)) continue
    options.push({ key, es: es || en, en: en || es })
  }
  return options
}

/** A species: speed, size, its traits and the traits whose option the player picks. */
export function SpeciesFields({
  entry,
  onChange,
  revealed = false,
}: {
  entry: EntryInput
  onChange: (next: EntryInput) => void
  revealed?: boolean
}) {
  const { t } = useTranslation()
  const [index, setIndex] = useIndex(entry, onChange)
  const traits = namedList(index.traits)
  const choices = Array.isArray(index.choices)
    ? (index.choices as { trait: string; options: Named[] }[])
    : []
  const check = speciesIndexSchema.safeParse(index)
  const invalid = new Set(check.success ? [] : check.error.issues.map((issue) => issue.path[0]))
  const species = entry.key || 'species'
  // Traits added here take their key from their name until saved; saved keys never change.
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set())
  const setTraits = (next: Named[], renamed?: { from: string; to: string }) =>
    setIndex({
      traits: next,
      choices: choices
        .map((choice) =>
          renamed && choice.trait === renamed.from ? { ...choice, trait: renamed.to } : choice,
        )
        .filter((choice) => next.some((trait) => trait.key === choice.trait)),
    })
  const traitKeyFor = (name: string, at: number) => {
    const base =
      keyFromName(name)
        .replace(/^[^a-z]+/, '')
        .slice(0, 36) || `trait-${at + 1}`
    let key = base
    for (let n = 2; traits.some((item, i) => i !== at && item.key === key); n++)
      key = `${base}-${n}`
    return key
  }
  const setChoice = (trait: string, options: Named[] | null) =>
    setIndex({
      choices: [
        ...choices.filter((choice) => choice.trait !== trait),
        ...(options ? [{ trait, options }] : []),
      ],
    })
  return (
    <>
      <div className="lib-grid-fields">
        <NumberInput
          label={t('library.origins.speed')}
          withAsterisk
          min={0}
          max={120}
          step={5}
          hideControls
          value={typeof index.speed === 'number' ? index.speed : ''}
          error={
            invalid.has('speed') && (revealed || index.speed !== undefined)
              ? t('library.origins.speedError')
              : undefined
          }
          onChange={(value) => setIndex({ speed: typeof value === 'number' ? value : undefined })}
        />
        <Select
          label={t('library.origins.size')}
          data={speciesSizes.map((value) => ({
            value,
            label: t(`library.origins.size.${value}` as 'library.origins.size.small'),
          }))}
          value={speciesSizes.find((value) => value === index.size) ?? 'medium'}
          allowDeselect={false}
          onChange={(value) => setIndex({ size: value ?? 'medium' })}
        />
      </div>
      <fieldset className="plain-fieldset lib-item-group">
        <legend className="lib-item-legend">{t('library.origins.traits')}</legend>
        {traits.length === 0 && (
          <Text size="sm" c="dimmed">
            {t('library.origins.noTraits')}
          </Text>
        )}
        {traits.map((trait, at) => {
          const choice = choices.find((item) => item.trait === trait.key)
          const rename = (patch: Partial<Named>) => {
            const named = { ...trait, ...patch }
            const key = fresh.has(at) ? traitKeyFor(named.en || named.es, at) : trait.key
            setTraits(
              traits.map((item, i) => (i === at ? { ...named, key } : item)),
              key === trait.key ? undefined : { from: trait.key, to: key },
            )
          }
          return (
            <div key={at} className="lib-origin-trait">
              <div className="lib-origin-trait-names">
                <TextInput
                  label={t('library.origins.traitEs')}
                  value={trait.es}
                  onChange={(event) => rename({ es: event.currentTarget.value })}
                />
                <TextInput
                  label={t('library.origins.traitEn')}
                  value={trait.en}
                  onChange={(event) => rename({ en: event.currentTarget.value })}
                />
                <ActionIcon
                  variant="subtle"
                  size={44}
                  color="red"
                  className="lib-origin-remove"
                  aria-label={
                    trait.es || trait.en
                      ? t('library.origins.removeTrait', { trait: trait.es || trait.en })
                      : t('library.origins.removeTraitBlank')
                  }
                  onClick={() => {
                    setFresh(
                      new Set(
                        [...fresh]
                          .filter((i) => i < at)
                          .concat([...fresh].filter((i) => i > at).map((i) => i - 1)),
                      ),
                    )
                    setTraits(traits.filter((_, i) => i !== at))
                  }}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </ActionIcon>
              </div>
              <Text size="xs" c="dimmed">
                {t('library.origins.traitText', {
                  key: `species-${species}-${kebab(trait.key)}`,
                })}
              </Text>
              <Checkbox
                className="lib-check-row"
                label={t('library.origins.hasOptions')}
                checked={Boolean(choice)}
                onChange={(event) => setChoice(trait.key, event.currentTarget.checked ? [] : null)}
              />
              {choice && (
                <Textarea
                  autosize
                  minRows={2}
                  label={t('library.origins.options')}
                  description={t('library.origins.optionsHint')}
                  defaultValue={optionLines(choice.options)}
                  error={
                    choice.options.length < 2 && (revealed || choice.options.length > 0)
                      ? t('library.origins.optionsError')
                      : undefined
                  }
                  onChange={(event) =>
                    setChoice(trait.key, parseOptions(event.currentTarget.value))
                  }
                />
              )}
            </div>
          )
        })}
        <Button
          variant="subtle"
          leftSection={<Plus size={16} aria-hidden="true" />}
          w="fit-content"
          disabled={traits.length >= 12}
          onClick={() => {
            setFresh(new Set([...fresh, traits.length]))
            setTraits([...traits, { key: traitKeyFor('', traits.length), en: '', es: '' }])
          }}
        >
          {t('library.origins.addTrait')}
        </Button>
        {revealed && invalid.has('traits') && (
          <Text size="sm" c="red" role="alert">
            {t('library.origins.traitsError')}
          </Text>
        )}
      </fieldset>
    </>
  )
}

/**
 * A background's origin feat: one of this pack's origin feats or the published SRD's, or another
 * by its key (a feat of another pack, `<ref>--<key>`).
 */
function OriginFeatField({
  packId,
  userId,
  value,
  onChange,
}: {
  packId: string
  userId: string
  value: string | null
  onChange: (value: string | null) => void
}) {
  const { t, i18n } = useTranslation()
  const library = useQuery({ ...libraryQuery(userId), enabled: Boolean(userId) })
  const srd = library.data?.packs.find((pack) => pack.slug === srdSlug && pack.id !== packId)
  const own = useQuery({ ...draftsQuery(userId, packId, 'feat'), enabled: Boolean(userId) })
  const srdFeats = useQuery({
    ...draftsQuery(userId, srd?.id ?? '', 'feat'),
    enabled: Boolean(userId && srd),
  })
  const name = (row: { name_en: string; name_es: string }) =>
    (i18n.language.startsWith('en') ? row.name_en || row.name_es : row.name_es || row.name_en) || ''
  type Row = NonNullable<typeof own.data>[number]
  const origin = (rows: Row[] | undefined) =>
    (rows ?? []).filter((row) => row.state !== 'deleted' && row.index?.category === 'origin')
  const ownFeats = origin(own.data)
  const options = [
    ...ownFeats.map((row) => ({ value: row.key, label: name(row) })),
    ...origin(srdFeats.data)
      .filter((row) => !ownFeats.some((item) => item.key === row.key))
      .map((row) => ({ value: row.key, label: `${name(row)} · SRD` })),
  ]
  const [typing, setTyping] = useState(false)
  const listed = value === null || options.some((option) => option.value === value)
  const other = typing || (!listed && Boolean(own.data && (srdFeats.data || !srd)))
  const keyPattern = /^(?:[0-9a-f]{8}--)?[a-z0-9]+(?:-[a-z0-9]+)*$/
  return (
    <>
      <Select
        label={t('library.origins.feat')}
        data={[
          { value: '', label: '—' },
          ...options,
          { value: 'other', label: t('library.origins.featOther') },
        ]}
        value={other ? 'other' : (value ?? '')}
        allowDeselect={false}
        onChange={(next) => {
          setTyping(next === 'other')
          if (next !== 'other') onChange(next || null)
        }}
      />
      {other && (
        <TextInput
          label={t('library.origins.featKey')}
          description={t('library.origins.featHint')}
          value={value ?? ''}
          error={value && !keyPattern.test(value) ? t('library.problem.key') : undefined}
          onChange={(event) => onChange(event.currentTarget.value.trim() || null)}
        />
      )}
    </>
  )
}

/** A background: its three abilities, its skills and the origin feat it grants. */
export function BackgroundFields({
  entry,
  onChange,
  revealed = false,
  packId,
  userId,
}: {
  entry: EntryInput
  onChange: (next: EntryInput) => void
  revealed?: boolean
  packId: string
  userId: string
}) {
  const { t } = useTranslation()
  const [index, setIndex] = useIndex(entry, onChange)
  const picked = Array.isArray(index.abilities) ? (index.abilities as string[]) : []
  const skillList = Array.isArray(index.skills) ? (index.skills as string[]) : []
  const check = backgroundIndexSchema.safeParse(index)
  const invalid = new Set(check.success ? [] : check.error.issues.map((issue) => issue.path[0]))
  const shown = (field: string) => invalid.has(field) && (revealed || index[field] !== undefined)
  return (
    <>
      <Checkbox.Group
        label={t('library.origins.abilities')}
        description={t('library.origins.abilitiesHint')}
        value={picked}
        onChange={(value) => setIndex({ abilities: value })}
        error={shown('abilities') ? t('library.origins.abilitiesError') : undefined}
      >
        <div className="lib-class-grid">
          {abilities.map((value) => (
            <Checkbox
              key={value}
              value={value}
              disabled={picked.length >= 3 && !picked.includes(value)}
              label={t(`srd.ability.${value}` as 'srd.ability.str')}
            />
          ))}
        </div>
      </Checkbox.Group>
      <Checkbox.Group
        label={t('library.origins.skills')}
        description={t('library.origins.skillsHint')}
        value={skillList}
        onChange={(value) => setIndex({ skills: value })}
        error={shown('skills') ? t('library.origins.skillsError') : undefined}
      >
        <div className="lib-class-grid">
          {skills.map((value) => (
            <Checkbox
              key={value}
              value={value}
              disabled={skillList.length >= 4 && !skillList.includes(value)}
              label={t(`srd.skill.${value}` as 'srd.skill.arcana')}
            />
          ))}
        </div>
      </Checkbox.Group>
      <div className="lib-origin-feat">
        <OriginFeatField
          packId={packId}
          userId={userId}
          value={typeof index.feat === 'string' ? index.feat : null}
          onChange={(feat) => setIndex({ feat })}
        />
        <Select
          label={t('library.origins.featList')}
          description={t('library.origins.featListHint')}
          data={[
            { value: '', label: '—' },
            ...classKeys.map((key) => ({
              value: key,
              label: t(`srd.class.${key}` as 'srd.class.wizard'),
            })),
          ]}
          value={typeof index.featList === 'string' ? index.featList : ''}
          allowDeselect={false}
          onChange={(value) => setIndex({ featList: value || null })}
        />
      </div>
    </>
  )
}

/** A feat: its category, minimum level and whether it can be taken again. */
export function FeatFields({
  entry,
  onChange,
  revealed = false,
}: {
  entry: EntryInput
  onChange: (next: EntryInput) => void
  revealed?: boolean
}) {
  const { t } = useTranslation()
  const [index, setIndex] = useIndex(entry, onChange)
  const valid = featIndexSchema.safeParse(index).success
  return (
    <>
      <div className="lib-grid-fields">
        <Select
          label={t('library.origins.category')}
          required
          data={featCategories.map((value) => ({
            value,
            label: t(`library.origins.category.${value}` as 'library.origins.category.origin'),
          }))}
          value={featCategories.find((value) => value === index.category) ?? null}
          error={
            !valid && (revealed || index.category !== undefined)
              ? t('library.classes.chooseError')
              : undefined
          }
          allowDeselect={false}
          onChange={(value) => setIndex({ category: value ?? undefined })}
        />
        <NumberInput
          label={t('library.origins.level')}
          placeholder={t('library.origins.levelNone')}
          min={1}
          max={20}
          hideControls
          value={typeof index.level === 'number' ? index.level : ''}
          onChange={(value) => setIndex({ level: typeof value === 'number' ? value : null })}
        />
      </div>
      <div className="lib-checks">
        <Checkbox
          className="lib-check-row"
          label={t('library.origins.repeatable')}
          checked={index.repeatable === true}
          onChange={(event) => setIndex({ repeatable: event.currentTarget.checked })}
        />
      </div>
      <Text size="xs" c="dimmed">
        {t('library.origins.featText', { key: `feat-${entry.key || 'feat'}` })}
      </Text>
    </>
  )
}
