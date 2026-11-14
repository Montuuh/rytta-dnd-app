import { useState } from 'react'
import {
  ActionIcon,
  Button,
  Checkbox,
  Chip,
  Group,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  UnstyledButton,
} from '@mantine/core'
import { BookOpen, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  GlossaryNameLink,
  GlossaryTerm,
  GlossaryText,
  glossaryIds,
  useGlossaryName,
} from '@/features/glossary'
import { removeFeature } from '../../domain/progression'
import { resourceSpec } from '../../domain/resources'
import { isClassKey, signed, skillBonus, slotsFor, spellcasting } from '../../domain/rules'
import { featureSources, type Feature, type Spell } from '../../domain/sheet'
import { conditionKeys, skillAbilities, skillKeys, subclassOf, type Skill } from '../../domain/srd'
import { Pips } from './pips'
import type { PanelProps } from './panel-types'
import { Counter } from './widgets'

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`

/** Class resources, custom resources, spell slots and hit point dice. */
export function ResourcesBlock({
  build,
  level,
  vitals,
  canEdit,
  locked,
  commit,
  onPersonalise,
}: PanelProps & { onPersonalise: () => void }) {
  const { t } = useTranslation()
  const slots = slotsFor(build.casterKind, level)
  const hitDiceLeft = level - Math.min(level, vitals.hit_dice_spent)
  return (
    <Stack gap="lg">
      {build.trackers.length === 0 && (
        <Text size="sm" c="dimmed">
          {t('sheet.noTrackers')}
        </Text>
      )}
      {build.trackers.map((tracker) => {
        const used = Math.min(tracker.max, vitals.tracker_uses[tracker.id] ?? 0)
        const spec = resourceSpec(tracker.key)
        const set = (next: number) =>
          commit({ ...vitals, tracker_uses: { ...vitals.tracker_uses, [tracker.id]: next } })
        return (
          <section key={tracker.id} className="resource-row" aria-label={tracker.name}>
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Text fw={600} className="user-copy">
                {spec ? (
                  <GlossaryTerm id={spec.feature}>{tracker.name}</GlossaryTerm>
                ) : (
                  tracker.name
                )}
              </Text>
              <Text size="sm" c="dimmed">
                {t(`sheet.reset.${tracker.reset}`)}
              </Text>
            </Group>
            {(tracker.display ?? 'pips') === 'counter' || tracker.max > 20 ? (
              <Counter
                name={tracker.name}
                max={tracker.max}
                used={used}
                disabled={!canEdit}
                onChange={set}
              />
            ) : (
              <Pips
                max={tracker.max}
                used={used}
                disabled={!canEdit}
                spendLabel={t('sheet.useOne', { name: tracker.name })}
                restoreLabel={t('sheet.restoreOne', { name: tracker.name })}
                countLabel={t('sheet.usesLeft', { left: tracker.max - used, max: tracker.max })}
                onChange={set}
              />
            )}
          </section>
        )
      })}
      {slots.some((count) => count > 0) && (
        <section aria-labelledby="panel-slots">
          <Text fw={600} id="panel-slots">
            {t('sheet.slots')}
          </Text>
          <Stack gap={0}>
            {slots.map((max, index) => {
              if (max === 0) return null
              const slotLevel = index + 1
              const used = Math.min(max, vitals.slots_used[index] ?? 0)
              return (
                <Group key={slotLevel} gap="xs" wrap="nowrap">
                  <Text size="sm" w={64}>
                    {t('sheet.slotLevel', { level: slotLevel })}
                  </Text>
                  <Pips
                    max={max}
                    used={used}
                    disabled={!canEdit}
                    spendLabel={t('sheet.useSlot', { level: slotLevel })}
                    restoreLabel={t('sheet.restoreSlot', { level: slotLevel })}
                    countLabel={`${max - used}/${max}`}
                    onChange={(next) => {
                      const slots_used = [...vitals.slots_used]
                      slots_used[index] = next
                      commit({ ...vitals, slots_used })
                    }}
                  />
                </Group>
              )
            })}
          </Stack>
        </section>
      )}
      <section aria-labelledby="panel-hit-dice">
        <Text fw={600} id="panel-hit-dice">
          <GlossaryTerm id="rule.hit-point-dice">{t('sheet.hitDice')}</GlossaryTerm>
        </Text>
        <Pips
          max={level}
          used={level - hitDiceLeft}
          // Spending hit dice heals: it follows the HP lock (RYT-070).
          disabled={!canEdit || locked}
          spendLabel={t('sheet.spendHitDieLabel')}
          restoreLabel={t('sheet.recoverHitDieLabel')}
          countLabel={`${hitDiceLeft}/${level}`}
          glyph={`d${build.hitDie}`}
          onChange={(used) => commit({ ...vitals, hit_dice_spent: used })}
        />
        {locked && (
          <Text size="sm" c="dimmed">
            {t('panel.hitDiceLocked')}
          </Text>
        )}
      </section>
      {canEdit && (
        <Button
          variant="subtle"
          className="panel-link"
          leftSection={<Plus size={16} aria-hidden="true" />}
          onClick={onPersonalise}
        >
          {t('panel.manageResources')}
        </Button>
      )}
    </Stack>
  )
}
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
                <span className="skill-bonus">{signed(skillBonus(build, level, skill))}</span>
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
  onPrepared,
  onRemove,
}: {
  spell: Spell
  editing: boolean
  canEdit: boolean
  onPrepared: (prepared: boolean) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const glossaryName = useGlossaryName()
  const name = (spell.ref && glossaryName(spell.ref)) || spell.name
  const marks = [
    spell.concentration ? t('sheet.concentration') : null,
    spell.ritual ? t('sheet.ritual') : null,
  ].filter(Boolean)
  return (
    <li className="feature-row">
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
      {spell.level > 0 && !editing && (
        <Checkbox
          size="md"
          label={t('sheet.prepared')}
          checked={spell.prepared}
          disabled={!canEdit}
          onChange={(event) => onPrepared(event.currentTarget.checked)}
        />
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
  const { build, level, editing, canEdit, change } = props
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
      {levels.map((spellLevelKey) => (
        <section key={spellLevelKey} aria-labelledby={`spells-${spellLevelKey}`}>
          <Text size="sm" c="dimmed" fw={600} id={`spells-${spellLevelKey}`}>
            {spellLevelKey === 0
              ? t('sheet.cantrips')
              : t('sheet.slotLevel', { level: spellLevelKey })}
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
    </Stack>
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
          <Chip.Group
            multiple
            value={[...vitals.conditions]}
            onChange={(next) =>
              commit({ ...vitals, conditions: conditionKeys.filter((key) => next.includes(key)) })
            }
          >
            <div className="condition-chips" role="group" aria-labelledby="panel-conditions">
              {conditionKeys.map((key) => (
                <Chip key={key} value={key} className="condition-chip">
                  {t(`srd.condition.${key}`)}
                </Chip>
              ))}
            </div>
          </Chip.Group>
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

/** Alignment, languages and appearance left the wizard (RYT-072); they live here. */
export function NotesBlock({ build, editing, change }: PanelProps) {
  const { t } = useTranslation()
  return (
    <Stack gap="md">
      {noteFields.map(([field, label, max]) =>
        editing ? (
          field === 'alignment' ? (
            <TextInput
              key={field}
              label={t(label)}
              maxLength={max}
              value={build[field]}
              onChange={(event) => {
                const value = event.currentTarget.value
                change((draft) => ({ ...draft, build: { ...draft.build, [field]: value } }))
              }}
            />
          ) : (
            <Textarea
              key={field}
              label={t(label)}
              maxLength={max}
              autosize
              minRows={2}
              value={build[field]}
              onChange={(event) => {
                const value = event.currentTarget.value
                change((draft) => ({ ...draft, build: { ...draft.build, [field]: value } }))
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
    </Stack>
  )
}
