import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  UnstyledButton,
} from '@mantine/core'
import {
  ArrowDownToLine,
  BookOpen,
  Check,
  CircleSlash,
  Eclipse,
  EarOff,
  EyeOff,
  FlaskConical,
  Ghost,
  Hand,
  Heart,
  Lock,
  Moon,
  Mountain,
  Orbit,
  Plus,
  SlidersHorizontal,
  Trash2,
  WandSparkles,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { RollHint, RollPoint, checkSpec } from '@/features/dice'
import {
  GlossaryNameLink,
  GlossaryTerm,
  GlossaryText,
  glossaryIds,
  useGlossaryName,
} from '@/features/glossary'
import { castAvailability, type CastAvailability } from '../../domain/casting'
import { removeFeature } from '../../domain/progression'
import { isClassKey, signed, skillBonus, slotsFor, spellcasting } from '../../domain/rules'
import {
  featureSources,
  hasForbiddenMarkerCharacters,
  markerFor,
  stripForbiddenMarkerCharacters,
  trimMarkerSpaces,
  type Feature,
  type Spell,
} from '../../domain/sheet'
import {
  conditionKeys,
  skillAbilities,
  skillKeys,
  subclassOf,
  type Condition,
  type Skill,
} from '../../domain/srd'
import { Pips } from './pips'
import type { PanelProps } from './panel-types'

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`

const nextLevel = {
  undefined: 'proficient',
  proficient: 'expertise',
  expertise: undefined,
} as const

/** Proficient skills by default; "Show all 18" lists the rest. Edit mode cycles each skill. */
export function SkillsBlock({ build, level, editing, change }: PanelProps) {
  const { t } = useTranslation()
  const [all, setAll] = useState(false)
  const shown = editing || all ? skillKeys : skillKeys.filter((skill) => build.skills[skill])
  const cycle = (skill: Skill) =>
    change((draft) => {
      const skills = { ...draft.build.skills }
      const next = nextLevel[String(skills[skill]) as keyof typeof nextLevel]
      if (next) skills[skill] = next
      else delete skills[skill]
      return { ...draft, build: { ...draft.build, skills } }
    })
  return (
    <Stack gap="sm">
      {!editing && <RollHint />}
      {!editing && (
        <Switch
          size="md"
          label={t('panel.showAllSkills')}
          checked={all}
          onChange={(event) => setAll(event.currentTarget.checked)}
        />
      )}
      {shown.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t('panel.noSkills')}
        </Text>
      ) : (
        <ul className="skill-list">
          {shown.map((skill) => {
            const proficiency = build.skills[skill]
            const name = t(`srd.skill.${skill}`)
            const marker =
              proficiency === 'expertise'
                ? t('sheet.expertiseShort')
                : proficiency === 'proficient'
                  ? t('sheet.proficientShort')
                  : ''
            return (
              <li key={skill} className="skill-row" data-level={proficiency}>
                {editing ? (
                  <UnstyledButton
                    className="skill-cycle"
                    aria-label={t('panel.cycleSkill', {
                      skill: name,
                      level: t(proficiency ? `sheet.${proficiency}` : 'panel.notProficient'),
                    })}
                    onClick={() => cycle(skill)}
                  >
                    <span className="skill-marker" aria-hidden="true">
                      {marker}
                    </span>
                  </UnstyledButton>
                ) : (
                  <span className="skill-marker" aria-hidden="true">
                    {marker}
                  </span>
                )}
                <span className="skill-name">
                  <GlossaryTerm id={glossaryIds.skill(skill)}>{name}</GlossaryTerm>
                  {proficiency && (
                    <span className="visually-hidden">, {t(`sheet.${proficiency}`)}</span>
                  )}
                </span>
                <span className="skill-ability">
                  {t(`srd.abilityShort.${skillAbilities[skill]}`)}
                </span>
                <RollPoint
                  spec={editing ? null : checkSpec('skill', skill, skillBonus(build, level, skill))}
                  formula="replace"
                  className="skill-bonus"
                >
                  {signed(skillBonus(build, level, skill))}
                </RollPoint>
              </li>
            )
          })}
        </ul>
      )}
      <Text size="sm" c="dimmed">
        {t('sheet.proficientShort')} = {t('sheet.proficient')}, {t('sheet.expertiseShort')} ={' '}
        {t('sheet.expertise')}
      </Text>
    </Stack>
  )
}

function FeatureRow({
  feature,
  editing,
  onRemove,
}: {
  feature: Feature
  editing: boolean
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const glossaryName = useGlossaryName()
  const name = (feature.ref && glossaryName(feature.ref)) || feature.name
  return (
    <li className="feature-row">
      <div className="feature-main">
        <Text fw={600} className="user-copy">
          {feature.ref ? <GlossaryTerm id={feature.ref}>{name}</GlossaryTerm> : name}
        </Text>
        {feature.level && (
          <Text size="sm" c="dimmed">
            {t('panel.levelShort', { level: feature.level })}
          </Text>
        )}
        {feature.description && (
          <Text size="sm" className="user-copy preserve-lines">
            <GlossaryText text={feature.description} />
          </Text>
        )}
      </div>
      {editing && (
        <ActionIcon
          size={44}
          variant="subtle"
          color="red"
          aria-label={t('panel.removeNamed', { name })}
          onClick={onRemove}
        >
          <Trash2 size={18} aria-hidden="true" />
        </ActionIcon>
      )}
    </li>
  )
}

/** SRD class features (linked to the glossary), species traits, feats and the player's own. */
export function FeaturesBlock(props: PanelProps & { onLibrary: () => void }) {
  const { t } = useTranslation()
  const { build, editing, canEdit, change } = props
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const srdSubclass = isClassKey(build.classKey) ? subclassOf[build.classKey] : undefined
  const add = () => {
    if (!name.trim()) return
    change(
      (draft) => ({
        ...draft,
        build: {
          ...draft.build,
          features: [
            ...draft.build.features,
            {
              id: newId('own'),
              name: name.trim(),
              source: 'other',
              description: description.trim(),
            },
          ],
        },
      }),
      'panel.added',
    )
    setName('')
    setDescription('')
    setAdding(false)
  }
  return (
    <Stack gap="md">
      {editing && srdSubclass && (
        <Select
          label={t('wizard.subclass')}
          data={[
            { value: '', label: t('panel.noSubclass') },
            { value: srdSubclass, label: t(`srd.subclass.${srdSubclass}` as 'srd.subclass.lore') },
            { value: 'custom', label: t('panel.otherSubclass') },
          ]}
          value={build.subclassKey ? build.subclassKey : build.subclass ? 'custom' : ''}
          allowDeselect={false}
          onChange={(value) =>
            change((draft) => ({
              ...draft,
              build: {
                ...draft.build,
                subclassKey: value === srdSubclass ? value : '',
                subclass:
                  value === srdSubclass
                    ? t(`srd.subclass.${srdSubclass}` as 'srd.subclass.lore')
                    : value === 'custom'
                      ? draft.build.subclass
                      : '',
              },
            }))
          }
        />
      )}
      {editing && !build.subclassKey && (srdSubclass === undefined || build.subclass) && (
        <TextInput
          label={t('panel.subclassName')}
          maxLength={60}
          value={build.subclass}
          onChange={(event) => {
            const value = event.currentTarget.value
            change((draft) => ({ ...draft, build: { ...draft.build, subclass: value } }))
          }}
        />
      )}
      {build.features.length === 0 && (
        <Text size="sm" c="dimmed">
          {t('sheet.noFeatures')}
        </Text>
      )}
      {featureSources.map((source) => {
        const items = build.features
          .filter((feature) => feature.source === source)
          .sort((a, b) => (a.level ?? 99) - (b.level ?? 99))
        if (items.length === 0) return null
        return (
          <section key={source} aria-labelledby={`features-${source}`}>
            <Text size="sm" c="dimmed" fw={600} id={`features-${source}`}>
              {t(`sheet.featureSource.${source}`)}
            </Text>
            <ul className="feature-list">
              {items.map((feature) => (
                <FeatureRow
                  key={feature.id}
                  feature={feature}
                  editing={editing}
                  onRemove={() =>
                    change(
                      (draft) => ({ ...draft, build: removeFeature(draft.build, feature.id) }),
                      'panel.removed',
                    )
                  }
                />
              ))}
            </ul>
          </section>
        )
      })}
      {canEdit && (
        <Group gap="xs">
          <Button
            variant="light"
            leftSection={<BookOpen size={16} aria-hidden="true" />}
            onClick={props.onLibrary}
          >
            {t('panel.fromLibrary')}
          </Button>
          <Button
            variant="subtle"
            leftSection={<Plus size={16} aria-hidden="true" />}
            aria-expanded={adding}
            onClick={() => setAdding((open) => !open)}
          >
            {t('panel.ownFeature')}
          </Button>
        </Group>
      )}
      {adding && (
        <Stack gap="xs" className="panel-inline-form">
          <TextInput
            label={t('wizard.featureName')}
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Textarea
            label={t('wizard.featureDescription')}
            maxLength={2000}
            autosize
            minRows={2}
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setAdding(false)}>
              {t('action.cancel')}
            </Button>
            <Button disabled={!name.trim()} onClick={add}>
              {t('panel.addFeature')}
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  )
}

function SpellRow({
  spell,
  editing,
  canEdit,
  availability,
  note,
  onCast,
  onPrepared,
  onRemove,
}: {
  spell: Spell
  editing: boolean
  canEdit: boolean
  /** What casting it can do now; null when this row offers no casting. */
  availability: CastAvailability | null
  /** What the last cast of this spell did, right under it: nothing it can cover. */
  note: string | null
  onCast: (name: string, opener: HTMLElement) => void
  onPrepared: (prepared: boolean) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const glossaryName = useGlossaryName()
  const name = (spell.ref && glossaryName(spell.ref)) || spell.name
  const noteRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (note) noteRef.current?.scrollIntoView({ block: 'nearest' })
  }, [note])
  const marks = [
    spell.concentration ? t('sheet.concentration') : null,
    spell.ritual ? t('sheet.ritual') : null,
  ].filter(Boolean)
  return (
    <li className="feature-row spell-row">
      <div className="feature-main">
        <Text fw={600} className="user-copy">
          {spell.ref ? <GlossaryTerm id={spell.ref}>{name}</GlossaryTerm> : name}
        </Text>
        {marks.length > 0 && (
          <Text size="sm" c="dimmed">
            {marks.join(', ')}
          </Text>
        )}
        {spell.notes && (
          <Text size="sm" className="user-copy preserve-lines">
            <GlossaryText text={spell.notes} />
          </Text>
        )}
        {!spell.ref && <GlossaryNameLink name={spell.name} />}
      </div>
      {((spell.level > 0 && !editing) || availability) && (
        <div className="spell-actions">
          {spell.level > 0 && !editing && (
            <Checkbox
              size="md"
              label={t('sheet.prepared')}
              checked={spell.prepared}
              disabled={!canEdit}
              onChange={(event) => onPrepared(event.currentTarget.checked)}
            />
          )}
          {availability && availability !== 'blocked' && (
            <Button
              variant="subtle"
              className="cast-trigger"
              aria-label={t('cast.actionNamed', { name })}
              leftSection={<WandSparkles size={18} aria-hidden="true" />}
              onClick={(event) => onCast(name, event.currentTarget)}
            >
              {t('cast.action')}
            </Button>
          )}
          {availability === 'ritual-only' && (
            <Text size="sm" c="dimmed" className="cast-why">
              {t('cast.ritualOnly')}
            </Text>
          )}
          {availability === 'blocked' && (
            <Text size="sm" c="dimmed" className="cast-why">
              {spell.level > 1 ? t('cast.noSlotsFrom', { level: spell.level }) : t('cast.noSlots')}
            </Text>
          )}
        </div>
      )}
      {note && (
        <Text size="sm" className="cast-note" tabIndex={-1} data-cast-note ref={noteRef}>
          {note}
        </Text>
      )}
      {editing && (
        <ActionIcon
          size={44}
          variant="subtle"
          color="red"
          aria-label={t('panel.removeNamed', { name })}
          onClick={onRemove}
        >
          <Trash2 size={18} aria-hidden="true" />
        </ActionIcon>
      )}
    </li>
  )
}

export function SpellsBlock(props: PanelProps & { onLibrary: () => void }) {
  const { t } = useTranslation()
  const { build, level, editing, canEdit, change, vitals, onCast, castNote } = props
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [spellLevel, setSpellLevel] = useState('0')
  const casting = spellcasting(build, level)
  const levels = [...new Set(build.spells.map((spell) => spell.level))].sort((a, b) => a - b)
  const setSpells = (
    update: (spells: Spell[]) => Spell[],
    notice?: 'panel.added' | 'panel.removed',
  ) =>
    change(
      (draft) => ({ ...draft, build: { ...draft.build, spells: update(draft.build.spells) } }),
      notice,
    )
  const slotMax = slotsFor(build.casterKind, level)
  const slotLeft = (slotLevel: number) =>
    slotMax[slotLevel - 1]! -
    Math.min(slotMax[slotLevel - 1]!, vitals.slots_used[slotLevel - 1] ?? 0)
  return (
    <Stack gap="md">
      {casting ? (
        <dl className="sheet-stats sheet-stats-3">
          <div className="sheet-stat">
            <dt>
              <GlossaryTerm id="rule.difficulty-class">{t('sheet.spellDc')}</GlossaryTerm>
            </dt>
            <dd>{casting.saveDc}</dd>
          </div>
          <div className="sheet-stat">
            <dt>
              <GlossaryTerm id="rule.spell-attack">{t('sheet.spellAttack')}</GlossaryTerm>
            </dt>
            <dd>{signed(casting.attack)}</dd>
          </div>
          <div className="sheet-stat">
            <dt>{t('sheet.spellAbility')}</dt>
            <dd>{t(`srd.abilityShort.${casting.ability}`)}</dd>
          </div>
        </dl>
      ) : (
        <Text size="sm" c="dimmed">
          {t('sheet.notCaster')}
        </Text>
      )}
      {build.spells.length === 0 && casting && (
        <Text size="sm" c="dimmed">
          {t('sheet.noSpells')}
        </Text>
      )}
      {build.casterKind === 'pact' && (
        <Text size="sm" c="dimmed">
          {slotMax
            .map((count, index) => (count > 0 ? index + 1 : 0))
            .filter(Boolean)
            .map((slotLevel) =>
              t('cast.pactLeft', {
                level: slotLevel,
                left: slotLeft(slotLevel),
                max: slotMax[slotLevel - 1]!,
              }),
            )}
        </Text>
      )}
      {levels.map((spellLevelKey) => (
        <section key={spellLevelKey} aria-labelledby={`spells-${spellLevelKey}`}>
          <Text size="sm" c="dimmed" fw={600} id={`spells-${spellLevelKey}`}>
            {spellLevelKey === 0
              ? t('sheet.cantrips')
              : t('sheet.slotLevel', { level: spellLevelKey })}
            {spellLevelKey > 0 && slotMax[spellLevelKey - 1]! > 0 && (
              <span className="spell-level-left">
                {' · '}
                {t('cast.slotLeft', {
                  left: slotLeft(spellLevelKey),
                  max: slotMax[spellLevelKey - 1]!,
                })}
              </span>
            )}
          </Text>
          <ul className="feature-list">
            {build.spells
              .filter((spell) => spell.level === spellLevelKey)
              .map((spell) => (
                <SpellRow
                  key={spell.id}
                  spell={spell}
                  editing={editing}
                  canEdit={canEdit}
                  note={castNote?.spellId === spell.id ? castNote.text : null}
                  availability={
                    canEdit && !editing && (spell.level === 0 || spell.prepared)
                      ? castAvailability(spell, build, level, vitals)
                      : null
                  }
                  onCast={(spellName, opener) => onCast(spell, spellName, opener)}
                  onPrepared={(prepared) =>
                    setSpells((spells) =>
                      spells.map((item) => (item.id === spell.id ? { ...item, prepared } : item)),
                    )
                  }
                  onRemove={() =>
                    setSpells(
                      (spells) => spells.filter((item) => item.id !== spell.id),
                      'panel.removed',
                    )
                  }
                />
              ))}
          </ul>
        </section>
      ))}
      {canEdit && (
        <Group gap="xs">
          <Button
            variant="light"
            leftSection={<BookOpen size={16} aria-hidden="true" />}
            onClick={props.onLibrary}
          >
            {t('panel.fromLibrary')}
          </Button>
          <Button
            variant="subtle"
            leftSection={<Plus size={16} aria-hidden="true" />}
            aria-expanded={adding}
            onClick={() => setAdding((open) => !open)}
          >
            {t('panel.ownSpell')}
          </Button>
        </Group>
      )}
      {adding && (
        <Stack gap="xs" className="panel-inline-form">
          <TextInput
            label={t('wizard.spellName')}
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Select
            label={t('wizard.spellLevel')}
            data={Array.from({ length: 10 }, (_, value) => ({
              value: String(value),
              label: value === 0 ? t('wizard.cantrip') : String(value),
            }))}
            value={spellLevel}
            allowDeselect={false}
            onChange={(value) => setSpellLevel(value ?? '0')}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setAdding(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              disabled={!name.trim()}
              onClick={() => {
                setSpells(
                  (spells) => [
                    ...spells,
                    {
                      id: newId('spell'),
                      name: name.trim(),
                      level: Number(spellLevel),
                      concentration: false,
                      ritual: false,
                      prepared: false,
                      notes: '',
                    },
                  ],
                  'panel.added',
                )
                setName('')
                setAdding(false)
              }}
            >
              {t('panel.addSpell')}
            </Button>
          </Group>
        </Stack>
      )}
      {canEdit && !editing && <ConcentrationManual {...props} />}
    </Stack>
  )
}

/** RYT-134: the concentration marker by hand, for a ruling at the table. Casting sets it on its
 * own; this ends it or marks it without casting. */
function ConcentrationManual({ vitals, commit }: PanelProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const field = useRef<HTMLInputElement>(null)
  // A pasted invisible or control character is refused in the field, never sent to the server.
  const invalid = hasForbiddenMarkerCharacters(text)
  const marker = invalid ? null : markerFor(text)
  const set = () => {
    if (!marker) return
    commit({ ...vitals, concentration: marker }, undefined, { value: marker })
    setText('')
  }
  return (
    <div className="cast-manual">
      <Button
        variant="subtle"
        className="cast-manual-toggle"
        aria-expanded={open}
        aria-controls="cast-manual-body"
        leftSection={<SlidersHorizontal size={16} aria-hidden="true" />}
        onClick={() => setOpen((value) => !value)}
      >
        {t('cast.manual.open')}
      </Button>
      {open && (
        <section
          id="cast-manual-body"
          aria-label={t('cast.manual.open')}
          className="cast-manual-body"
        >
          {vitals.concentration ? (
            <div className="cast-manual-current">
              <Text className="user-copy cast-manual-name">{vitals.concentration}</Text>
              <Button
                variant="default"
                className="cast-manual-end"
                leftSection={<X size={16} aria-hidden="true" />}
                aria-label={t('cast.marker.endNamed', { name: vitals.concentration })}
                onClick={() =>
                  commit({ ...vitals, concentration: null }, undefined, { value: null })
                }
              >
                {t('cast.marker.end')}
              </Button>
            </div>
          ) : (
            <Text size="sm" c="dimmed">
              {t('cast.manual.none')}
            </Text>
          )}
          <form
            className="cast-manual-form"
            onSubmit={(event) => {
              event.preventDefault()
              set()
            }}
          >
            <TextInput
              label={t('cast.manual.label')}
              description={t('cast.manual.hint')}
              maxLength={100}
              value={text}
              ref={field}
              error={invalid ? t('cast.manual.invalid') : undefined}
              onChange={(event) => setText(event.currentTarget.value)}
            />
            {invalid && (
              <Button
                variant="default"
                onClick={() => {
                  setText(trimMarkerSpaces(stripForbiddenMarkerCharacters(text)))
                  // The button goes away once the name is clean: focus stays with the field.
                  field.current?.focus()
                }}
              >
                {t('cast.manual.clean')}
              </Button>
            )}
            <Button
              type="submit"
              variant="default"
              aria-disabled={!marker || undefined}
              aria-label={t('cast.manual.setNamed')}
            >
              {t('cast.manual.set')}
            </Button>
          </form>
        </section>
      )}
    </div>
  )
}

const conditionIcons: Record<Condition, LucideIcon> = {
  blinded: EyeOff,
  charmed: Heart,
  deafened: EarOff,
  frightened: Ghost,
  grappled: Hand,
  incapacitated: CircleSlash,
  invisible: Eclipse,
  paralyzed: Zap,
  petrified: Mountain,
  poisoned: FlaskConical,
  prone: ArrowDownToLine,
  restrained: Lock,
  stunned: Orbit,
  unconscious: Moon,
}

/** RYT-112: the 14 conditions as a grid of toggles (icon and name) in a fixed order. The check marks "on" besides the fill. */
function ConditionToggles({
  active,
  onChange,
}: {
  active: readonly Condition[]
  onChange: (next: Condition[]) => void
}) {
  const { t } = useTranslation()
  // The order is fixed while the toggles are on screen, so a tap never lands on a moved control.
  const toggle = (key: Condition) => {
    onChange(active.includes(key) ? active.filter((item) => item !== key) : [...active, key])
  }
  return (
    <>
      <Text size="sm" c="dimmed" mb="xs">
        {t('sheet.conditionsHint')}
      </Text>
      <div className="condition-grid" role="group" aria-labelledby="panel-conditions">
        {conditionKeys.map((key) => {
          const on = active.includes(key)
          const Icon = conditionIcons[key]
          return (
            <button
              key={key}
              type="button"
              className="condition-toggle"
              data-condition={key}
              data-on={on || undefined}
              aria-pressed={on}
              onClick={() => toggle(key)}
            >
              <Icon size={18} aria-hidden="true" />
              <span className="condition-toggle-name">{t(`srd.condition.${key}`)}</span>
              {on && <Check size={16} strokeWidth={3} aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </>
  )
}

/** Conditions and death saving throws (play state; never locked by RYT-070). */
export function ConditionsBlock({
  vitals,
  canEdit,
  commit,
  exhaustion,
}: PanelProps & {
  exhaustion: number | undefined
}) {
  const { t } = useTranslation()
  return (
    <Stack gap="lg">
      <section aria-labelledby="panel-conditions">
        <Text fw={600} id="panel-conditions">
          <GlossaryTerm id="rule.condition">{t('sheet.conditions')}</GlossaryTerm>
        </Text>
        {vitals.conditions.length > 0 && (
          <Text size="sm" className="condition-links">
            {t('glossary.activeConditions')}{' '}
            {vitals.conditions.map((key, index) => (
              <span key={key}>
                {index > 0 && ', '}
                <GlossaryTerm id={glossaryIds.condition(key)}>
                  {t(`srd.condition.${key}`)}
                </GlossaryTerm>
              </span>
            ))}
          </Text>
        )}
        {canEdit ? (
          <ConditionToggles
            active={vitals.conditions}
            onChange={(next) =>
              commit({ ...vitals, conditions: conditionKeys.filter((key) => next.includes(key)) })
            }
          />
        ) : (
          vitals.conditions.length === 0 && (
            <Text size="sm" c="dimmed">
              {t('sheet.noConditions')}
            </Text>
          )
        )}
        {exhaustion !== undefined && exhaustion > 0 && (
          <Text size="sm" className="sheet-exhaustion" mt="xs">
            <GlossaryTerm id="condition.exhaustion">
              {t('sheet.exhaustion', { value: exhaustion })}
            </GlossaryTerm>
          </Text>
        )}
      </section>
      <section aria-labelledby="panel-death">
        <Text fw={600} id="panel-death">
          <GlossaryTerm id="rule.death-saving-throw">{t('sheet.deathSaves')}</GlossaryTerm>
        </Text>
        {(['death_successes', 'death_failures'] as const).map((field) => {
          const label = t(field === 'death_successes' ? 'sheet.successes' : 'sheet.failures')
          return (
            <Group key={field} gap="xs" wrap="nowrap" className="death-row">
              <Text size="sm" w={72}>
                {label}
              </Text>
              <Pips
                max={3}
                used={3 - vitals[field]}
                disabled={!canEdit}
                spendLabel={`${label}: −1`}
                restoreLabel={`${label}: +1`}
                countLabel={`${vitals[field]}/3`}
                onChange={(used) => commit({ ...vitals, [field]: 3 - used })}
              />
            </Group>
          )
        })}
      </section>
    </Stack>
  )
}

const noteFields = [
  ['alignment', 'sheet.alignment', 40],
  ['languages', 'sheet.languages', 500],
  ['proficiencies', 'sheet.otherProficiencies', 1000],
  ['appearance', 'sheet.appearance', 2000],
  ['notes', 'sheet.notes', 4000],
] as const

type NoteField = (typeof noteFields)[number][0]
const pickNotes = (build: PanelProps['build']): Record<NoteField, string> => ({
  alignment: build.alignment,
  languages: build.languages,
  proficiencies: build.proficiencies,
  appearance: build.appearance,
  notes: build.notes,
})

/** Alignment, languages and appearance left the wizard (RYT-072); they live here.
 * In play the notes are written in place and saved from the sheet itself (and when it closes),
 * without going through edit mode. */
export function NotesBlock({ build, editing, canEdit, pending, change }: PanelProps) {
  const { t } = useTranslation()
  const [local, setLocal] = useState(() => pickNotes(build))
  const saved = pickNotes(build)
  const inPlay = canEdit && !editing
  const dirty = inPlay && noteFields.some(([field]) => local[field] !== saved[field])
  const save = () =>
    change((draft) => ({ ...draft, build: { ...draft.build, ...local } }), 'sheet.saved')
  // Closing the sheet keeps what was written: the latest values are read at unmount.
  const latest = useRef({ dirty, save })
  useEffect(() => {
    latest.current = { dirty, save }
  })
  useEffect(
    () => () => {
      if (latest.current.dirty) latest.current.save()
    },
    [],
  )
  return (
    <Stack gap="md">
      {noteFields.map(([field, label, max]) =>
        editing || inPlay ? (
          field === 'alignment' ? (
            <TextInput
              key={field}
              label={t(label)}
              maxLength={max}
              value={editing ? build[field] : local[field]}
              onChange={(event) => {
                const value = event.currentTarget.value
                if (editing)
                  change((draft) => ({ ...draft, build: { ...draft.build, [field]: value } }))
                else setLocal((current) => ({ ...current, [field]: value }))
              }}
            />
          ) : (
            <Textarea
              key={field}
              label={t(label)}
              maxLength={max}
              autosize
              minRows={2}
              value={editing ? build[field] : local[field]}
              onChange={(event) => {
                const value = event.currentTarget.value
                if (editing)
                  change((draft) => ({ ...draft, build: { ...draft.build, [field]: value } }))
                else setLocal((current) => ({ ...current, [field]: value }))
              }}
            />
          )
        ) : (
          <section key={field}>
            <Text fw={600}>{t(label)}</Text>
            <Text
              size="sm"
              c={build[field] ? undefined : 'dimmed'}
              className="user-copy preserve-lines"
            >
              {build[field] ? <GlossaryText text={build[field]} /> : t('sheet.unset')}
            </Text>
          </section>
        ),
      )}
      {inPlay && (
        <div className="notes-save">
          <Button
            leftSection={<Check size={16} aria-hidden="true" />}
            aria-disabled={!dirty || pending || undefined}
            onClick={() => dirty && !pending && save()}
          >
            {t('panel.saveNotes')}
          </Button>
          <Text size="sm" c="dimmed" aria-live="polite">
            {dirty ? t('panel.notesUnsaved') : t('panel.notesSaved')}
          </Text>
        </div>
      )}
    </Stack>
  )
}
