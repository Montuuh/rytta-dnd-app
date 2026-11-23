import { classDefFor, offeredClasses, srdClassDefs } from '../../domain/class-catalog'
import { useClassCatalog, useClassDefName } from '../class-catalog'
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Group,
  NativeSelect,
  NumberInput,
  Paper,
  Radio,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import { BookOpen, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  assignStandard,
  chooseBackground,
  chooseClass,
  chooseSpecies,
  classChangeLoss,
  classSkillChoices,
  normalizeDraft,
  pointBuyCeiling,
  pointBuyStart,
  suggestedHpFor,
  type ClassLoss,
  type CreationStep,
  type StepGap,
} from '../../domain/creation'
import { syncProgression } from '../../domain/progression'
import { LockedLevel } from '../level-up/locked-level'
import { reseedStandard, standardAbilitiesFor } from '../../domain/quick'
import {
  defaultArmorClass,
  finalAbilities,
  isBackgroundKey,
  isSpeciesKey,
  modifier,
  pointBuySpent,
  signed,
  slotsFor,
} from '../../domain/rules'
import { featureSources, restKinds, type Build, type SheetDraft } from '../../domain/sheet'
import {
  abilityKeys,
  backgroundKeys,
  backgrounds,
  casterKinds,
  classes,
  hitDice,
  pointBuyBudget,
  pointBuyCost,
  skillKeys,
  species,
  speciesKeys,
  standardArray,
  type Ability,
  type Skill,
} from '../../domain/srd'
import { useSrdLibrary } from '@/features/glossary'
import { HpField } from '../hp-field'
import { useCharacterLabels } from '../labels'
import { useResourceNames, useTrackerLabel } from '../resource-names'
import { LibraryPicker, type LibraryTab } from '../sheet/library'
import { Stepper } from '../sheet/widgets'
import { BuildSummary } from './build-summary'
import { SpeciesOptions } from './species-options'
import { ClassPicker } from './class-picker'
import { newRequestId } from '@/shared/lib/request-id'

/** What the wizard keeps across steps: ability scores per method, what a class change removed,
 * the name and the choices still open. */
export type Session = {
  scores: Partial<Record<Build['abilityMethod'], Build['baseAbilities']>>
  remember: (method: Build['abilityMethod'], scores: Build['baseAbilities']) => void
  classLoss: ClassLoss | null
  setClassLoss: (loss: ClassLoss | null) => void
  editing: boolean
  /** RYT-130: the level is not edited by hand (a Player's finished sheet). */
  levelLocked: boolean
  name: string
  setName: (name: string) => void
  gaps: { step: CreationStep; gap: StepGap }[]
  goTo: (step: CreationStep) => void
}
type StepProps = {
  draft: SheetDraft
  setDraft: Dispatch<SetStateAction<SheetDraft>>
  session: Session
}
const newId = () => newRequestId()

export function CreationStepView({ step, ...props }: StepProps & { step: CreationStep }) {
  switch (step) {
    case 'class':
      return <ClassStep {...props} />
    case 'origin':
      return <OriginStep {...props} />
    case 'abilities':
      return <AbilitiesStep {...props} />
    case 'skills':
      return <SkillsStep {...props} />
    case 'combat':
      return <CombatStep {...props} />
    case 'spells':
      return <SpellsStep {...props} />
    case 'details':
      return <DetailsStep {...props} />
  }
}

function useBuild({ setDraft }: StepProps) {
  return (change: (build: Build) => Build) =>
    setDraft((draft) => ({ ...draft, build: change(draft.build) }))
}
const asInt = (value: number | string, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback

/** What a class change removed, then the recalculated HP apart from that list. It shows up below
 * the class grid, so it is scrolled into view (focus stays on the card the player tapped). */
function ClassLossNotice({ loss, maxHp }: { loss: ClassLoss; maxHp: number }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [loss])
  const removed = Boolean(loss.subclass) || loss.skills > 0 || loss.spells > 0
  return (
    <Alert color="yellow" role="status" ref={ref} className="wizard-class-loss">
      {removed && (
        <>
          <Text size="sm" fw={600}>
            {t('wizard.classLoss.title')}
          </Text>
          <ul className="wizard-loss-list">
            {loss.subclass && <li>{t('wizard.classLoss.subclass', { name: loss.subclass })}</li>}
            {loss.skills > 0 && <li>{t('wizard.classLoss.skills', { count: loss.skills })}</li>}
            {loss.spells > 0 && <li>{t('wizard.classLoss.spells', { count: loss.spells })}</li>}
          </ul>
        </>
      )}
      <Text size="sm" mt={removed ? 'xs' : 0}>
        {t('wizard.classLoss.hp', { value: maxHp })}
      </Text>
    </Alert>
  )
}

function ClassStep(props: StepProps) {
  const { t } = useTranslation()
  const { draft, setDraft, session } = props
  const update = useBuild(props)
  const { build } = draft
  const loss = session.classLoss
  const catalog = useClassCatalog()
  const nameOf = useClassDefName()
  const classOptions = catalog ? offeredClasses(catalog) : srdClassDefs
  return (
    <Stack gap="md">
      <ClassPicker
        options={classOptions}
        value={build.classKey}
        label={t('wizard.class')}
        description={t('wizard.classHint')}
        withCustom
        showSaves
        onChange={(key) => {
          if (key === build.classKey) return
          const def = classDefFor(catalog, key)
          const label = key === 'custom' || !def ? build.classLabel : nameOf(def)
          // A new class re-places the standard array it seeded and re-suggests the HP; what it
          // removes is named once below the picker.
          const next = reseedStandard(build, chooseClass(build, key, label, def))
          session.setClassLoss(classChangeLoss(build, next))
          setDraft((current) => ({
            ...current,
            build: next,
            maxHp: suggestedHpFor({ ...current, build: next }),
          }))
        }}
      />
      {loss && <ClassLossNotice loss={loss} maxHp={draft.maxHp} />}
      {build.classKey === 'custom' && (
        <Paper p="md" className="sheet-block">
          <Stack gap="sm">
            <TextInput
              required
              maxLength={60}
              label={t('wizard.customName')}
              value={build.classLabel}
              onChange={(event) => {
                const classLabel = event.currentTarget.value
                update((current) => ({ ...current, classLabel }))
              }}
            />
            <NativeSelect
              label={t('wizard.hitDie')}
              value={String(build.hitDie)}
              data={hitDice.map((die) => ({ value: String(die), label: `d${die}` }))}
              onChange={(event) => {
                const hitDie = Number(event.currentTarget.value) as Build['hitDie']
                update((current) => ({ ...current, hitDie }))
              }}
            />
            <Checkbox.Group
              label={t('wizard.saves')}
              value={build.saves}
              onChange={(value) => update((current) => ({ ...current, saves: value as Ability[] }))}
            >
              <SimpleGrid cols={3} spacing="xs" mt="xs">
                {abilityKeys.map((key) => (
                  <Checkbox key={key} value={key} label={t(`srd.ability.${key}`)} />
                ))}
              </SimpleGrid>
            </Checkbox.Group>
            <NativeSelect
              label={t('wizard.casterKind')}
              value={build.casterKind}
              data={casterKinds.map((kind) => ({ value: kind, label: t(`srd.caster.${kind}`) }))}
              onChange={(event) => {
                const casterKind = event.currentTarget.value as Build['casterKind']
                update((current) => ({
                  ...current,
                  casterKind,
                  spellAbility: casterKind === 'none' ? null : (current.spellAbility ?? 'int'),
                }))
              }}
            />
            {build.casterKind !== 'none' && (
              <NativeSelect
                label={t('wizard.spellAbility')}
                value={build.spellAbility ?? 'int'}
                data={abilityKeys.map((key) => ({ value: key, label: t(`srd.ability.${key}`) }))}
                onChange={(event) => {
                  const spellAbility = event.currentTarget.value as Ability
                  update((current) => ({ ...current, spellAbility }))
                }}
              />
            )}
          </Stack>
        </Paper>
      )}
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
        <TextInput
          maxLength={60}
          label={t('wizard.subclass')}
          value={build.subclass}
          onChange={(event) => {
            const subclass = event.currentTarget.value
            update((current) => ({ ...current, subclass }))
          }}
        />
        <div>
          <Text size="sm" fw={500} mb={4}>
            {t('wizard.level')}
          </Text>
          {session.levelLocked ? (
            <LockedLevel level={draft.level} />
          ) : (
            <Stepper
              label={t('wizard.level')}
              name={t('panel.levelName')}
              value={draft.level}
              min={1}
              max={20}
              onChange={(level) => setDraft((current) => ({ ...current, level }))}
            />
          )}
        </div>
      </SimpleGrid>
    </Stack>
  )
}

function OriginStep(props: StepProps) {
  const { t } = useTranslation()
  const update = useBuild(props)
  const { build } = props.draft
  const name = (kind: 'trait' | 'feat', key: string) => t(`srd.${kind}.${key}` as 'srd.trait.luck')
  const allowed: readonly Ability[] = isBackgroundKey(build.backgroundKey)
    ? backgrounds[build.backgroundKey].abilities
    : abilityKeys
  return (
    <Stack gap="md">
      <NativeSelect
        label={t('wizard.species')}
        value={build.speciesKey}
        data={[
          { value: '', label: '—' },
          ...speciesKeys.map((key) => ({ value: key, label: t(`srd.species.${key}`) })),
          { value: 'custom', label: t('srd.custom') },
        ]}
        onChange={(event) => {
          const key = event.currentTarget.value
          update((current) =>
            chooseSpecies(
              current,
              key,
              key === 'custom' || !key
                ? current.speciesLabel
                : t(`srd.species.${key}` as 'srd.species.elf'),
              name,
            ),
          )
        }}
      />
      {isSpeciesKey(build.speciesKey) && (
        <Text size="sm" c="dimmed">
          {t('wizard.speciesGrants', {
            speed: species[build.speciesKey].speed,
            traits: species[build.speciesKey].traits
              .map((trait) => name('trait', trait))
              .join(', '),
          })}
        </Text>
      )}
      <SpeciesOptions
        build={build}
        onChoose={(key, value) =>
          update((current) => ({
            ...current,
            choices: { ...current.choices, [key]: value },
          }))
        }
      />
      {build.speciesKey === 'custom' && (
        <TextInput
          required
          maxLength={60}
          label={t('wizard.customName')}
          value={build.speciesLabel}
          onChange={(event) => {
            const speciesLabel = event.currentTarget.value
            update((current) => ({ ...current, speciesLabel }))
          }}
        />
      )}
      <NativeSelect
        label={t('wizard.background')}
        value={build.backgroundKey}
        data={[
          { value: '', label: '—' },
          ...backgroundKeys.map((key) => ({ value: key, label: t(`srd.background.${key}`) })),
          { value: 'custom', label: t('srd.custom') },
        ]}
        onChange={(event) => {
          const key = event.currentTarget.value
          update((current) =>
            chooseBackground(
              current,
              key,
              key === 'custom' || !key
                ? current.backgroundLabel
                : t(`srd.background.${key}` as 'srd.background.sage'),
              name,
            ),
          )
        }}
      />
      {isBackgroundKey(build.backgroundKey) && (
        <Text size="sm" c="dimmed">
          {t('wizard.backgroundGrants', {
            skills: backgrounds[build.backgroundKey].skills
              .map((skill) => t(`srd.skill.${skill}`))
              .join(', '),
            feat: name('feat', backgrounds[build.backgroundKey].feat),
          })}
        </Text>
      )}
      {build.backgroundKey === 'custom' && (
        <TextInput
          required
          maxLength={60}
          label={t('wizard.customName')}
          value={build.backgroundLabel}
          onChange={(event) => {
            const backgroundLabel = event.currentTarget.value
            update((current) => ({ ...current, backgroundLabel }))
          }}
        />
      )}
      {build.backgroundKey && (
        <fieldset className="plain-fieldset">
          <legend>
            <Text fw={600}>{t('wizard.bonuses')}</Text>
          </legend>
          <Text size="sm" c="dimmed" mb="xs">
            {t('wizard.bonusesHint')}
          </Text>
          <SimpleGrid cols={{ base: 2, xs: 3 }} spacing="xs">
            {allowed.map((key) => (
              <NativeSelect
                key={key}
                label={t(`srd.ability.${key}`)}
                aria-label={t('wizard.bonusFor', { ability: t(`srd.ability.${key}`) })}
                value={String(build.bonuses[key])}
                data={['0', '1', '2'].map((value) => ({
                  value,
                  label: value === '0' ? '—' : `+${value}`,
                }))}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value)
                  update((current) => ({
                    ...current,
                    bonuses: { ...current.bonuses, [key]: value },
                  }))
                }}
              />
            ))}
          </SimpleGrid>
        </fieldset>
      )}
    </Stack>
  )
}

function AbilitiesStep(props: StepProps) {
  const { t } = useTranslation()
  const update = useBuild(props)
  const { session } = props
  const { build } = props.draft
  const totals = finalAbilities(build)
  const spent = pointBuySpent(build.baseAbilities)
  const method = build.abilityMethod
  const setScores = (baseAbilities: Build['baseAbilities']) =>
    update((current) => ({ ...current, baseAbilities }))
  return (
    <Stack gap="md">
      <SegmentedControl
        fullWidth
        aria-label={t('wizard.method')}
        value={method}
        data={(['standard', 'pointBuy', 'manual'] as const).map((value) => ({
          value,
          label: t(`wizard.method.${value}`),
        }))}
        onChange={(value) => {
          const next = value as Build['abilityMethod']
          // Each method keeps its own scores while the wizard is open.
          session.remember(method, build.baseAbilities)
          update((current) => ({
            ...current,
            abilityMethod: next,
            baseAbilities:
              session.scores[next] ??
              (next === 'pointBuy'
                ? pointBuyStart()
                : next === 'standard'
                  ? standardAbilitiesFor(current.classKey)
                  : current.baseAbilities),
          }))
        }}
      />
      <Text size="sm" c="dimmed" aria-live="polite">
        {method === 'standard'
          ? t(isClassKeyValue(build.classKey) ? 'wizard.standardHintClass' : 'wizard.standardHint')
          : method === 'pointBuy'
            ? t('wizard.pointBuyHint', {
                left: spent === null ? '—' : pointBuyBudget - spent,
                total: pointBuyBudget,
              })
            : t('wizard.manualHint')}
      </Text>
      <ul className="score-rows">
        {abilityKeys.map((key) => {
          const label = t(`srd.ability.${key}`)
          const score = build.baseAbilities[key]
          const total = t('wizard.finalScore', {
            score: totals[key],
            mod: signed(modifier(totals[key])),
          })
          return (
            <li key={key} className="score-row">
              <div className="score-row-name">
                <span id={`score-${key}`}>{label}</span>
                <Text size="xs" c="dimmed">
                  {total}
                  {method === 'pointBuy' && pointBuyCost[score] !== undefined
                    ? ` · ${t('wizard.pointCost', { cost: pointBuyCost[score] })}`
                    : ''}
                </Text>
              </div>
              {method === 'standard' ? (
                <NativeSelect
                  aria-labelledby={`score-${key}`}
                  className="score-row-select"
                  value={String(score)}
                  data={[...new Set([...standardArray, score])].map((value) => ({
                    value: String(value),
                    label: String(value),
                  }))}
                  onChange={(event) =>
                    setScores(
                      assignStandard(build.baseAbilities, key, Number(event.currentTarget.value)),
                    )
                  }
                />
              ) : (
                <Stepper
                  label={label}
                  name={t('panel.scoreName', { ability: label })}
                  value={score}
                  min={method === 'pointBuy' ? 8 : 1}
                  max={method === 'pointBuy' ? pointBuyCeiling(build.baseAbilities, key) : 30}
                  onChange={(value) => setScores({ ...build.baseAbilities, [key]: value })}
                />
              )}
            </li>
          )
        })}
      </ul>
    </Stack>
  )
}
const isClassKeyValue = (key: string) => key in classes

function SkillsStep(props: StepProps) {
  const { t } = useTranslation()
  const update = useBuild(props)
  const { build } = props.draft
  const catalog = useClassCatalog()
  const { fixed, picked, count, options } = classSkillChoices(
    build,
    classDefFor(catalog, build.classKey),
  )
  const full = count !== null && picked.length >= count
  const toggle = (skill: Skill, on: boolean) =>
    update((current) => {
      const skills = { ...current.skills }
      if (on) skills[skill] = 'proficient'
      else delete skills[skill]
      return { ...current, skills }
    })
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {count === null ? t('wizard.skillsFree') : t('wizard.skillsHint', { count })}
      </Text>
      {count !== null && (
        <Text size="sm" fw={600} aria-live="polite">
          {t('wizard.skillsPicked', { picked: picked.length, count })}
        </Text>
      )}
      <ul className="skill-picker">
        {skillKeys.map((skill) => {
          const fromBackground = fixed.includes(skill)
          const proficient = Boolean(build.skills[skill])
          const offered = !options || options.includes(skill)
          const label = t(`srd.skill.${skill}`)
          return (
            <li key={skill}>
              <Checkbox
                label={label}
                description={fromBackground ? t('wizard.fromBackground') : undefined}
                checked={proficient}
                disabled={fromBackground || (!proficient && (!offered || full))}
                onChange={(event) => toggle(skill, event.currentTarget.checked)}
              />
              {proficient && (
                <Checkbox
                  size="sm"
                  label={t('wizard.expertise')}
                  aria-label={t('wizard.expertiseFor', { skill: label })}
                  checked={build.skills[skill] === 'expertise'}
                  onChange={(event) => {
                    const level = event.currentTarget.checked ? 'expertise' : 'proficient'
                    update((current) => ({
                      ...current,
                      skills: { ...current.skills, [skill]: level },
                    }))
                  }}
                />
              )}
            </li>
          )
        })}
      </ul>
    </Stack>
  )
}

function CombatStep(props: StepProps) {
  const { t } = useTranslation()
  const { draft, setDraft } = props
  const update = useBuild(props)
  const suggested = suggestedHpFor(draft)
  const follows = draft.maxHp === suggested
  const unarmored = defaultArmorClass(draft.build)
  return (
    <Stack gap="md">
      <Group align="flex-end" gap="sm">
        <HpField
          className="grow-input"
          label={t('wizard.maxHp')}
          description={t(follows ? 'wizard.suggestedFollows' : 'wizard.suggestedManual', {
            value: suggested,
          })}
          value={draft.maxHp}
          onChange={(maxHp) => setDraft((current) => ({ ...current, maxHp }))}
        />
        <Button
          variant="light"
          disabled={follows}
          onClick={() => setDraft((current) => ({ ...current, maxHp: suggested }))}
        >
          {t('wizard.useSuggested')}
        </Button>
      </Group>
      <Radio.Group
        label={t('wizard.ac')}
        value={draft.build.acOverride === null ? 'auto' : 'manual'}
        onChange={(value) =>
          update((current) => ({
            ...current,
            acOverride: value === 'auto' ? null : (current.acOverride ?? unarmored),
          }))
        }
      >
        <Stack gap="xs" mt="xs">
          <Radio value="auto" label={t('wizard.acAuto', { value: unarmored })} />
          <Radio value="manual" label={t('wizard.acManual')} />
        </Stack>
      </Radio.Group>
      {draft.build.acOverride !== null && (
        <NumberInput
          hideControls
          label={t('wizard.ac')}
          min={0}
          max={99}
          allowDecimal={false}
          allowNegative={false}
          value={draft.build.acOverride}
          onChange={(value) =>
            update((current) => ({
              ...current,
              acOverride: Math.min(99, Math.max(0, asInt(value, current.acOverride ?? 10))),
            }))
          }
        />
      )}
      <NumberInput
        hideControls
        label={t('wizard.speed')}
        min={0}
        max={200}
        step={5}
        allowDecimal={false}
        allowNegative={false}
        value={draft.build.speed}
        onChange={(value) =>
          update((current) => ({
            ...current,
            speed: Math.min(200, Math.max(0, asInt(value, current.speed))),
          }))
        }
      />
    </Stack>
  )
}

function SpellsStep(props: StepProps) {
  const { t } = useTranslation()
  const update = useBuild(props)
  const { build } = props.draft
  const [picking, setPicking] = useState(false)
  const [tab, setTab] = useState<LibraryTab>('spells')
  const slots = slotsFor(build.casterKind, props.draft.level)
  const maxSpellLevel = slots.reduce((top, count, index) => (count > 0 ? index + 1 : top), 0)
  const cantrips = build.spells.filter((spell) => spell.level === 0).length
  const prepared = build.spells.filter((spell) => spell.level > 0 && spell.prepared).length
  const slotText = slots
    .flatMap((count, index) =>
      count > 0 ? [`${t('sheet.slotLevel', { level: index + 1 })}: ${count}`] : [],
    )
    .join(', ')
  const patch = (id: string, change: Partial<Build['spells'][number]>) =>
    update((current) => ({
      ...current,
      spells: current.spells.map((spell) => (spell.id === id ? { ...spell, ...change } : spell)),
    }))
  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {t('wizard.spellsHint')}
      </Text>
      {slotText && <Text size="sm">{t('wizard.slotsAtLevel', { slots: slotText })}</Text>}
      {build.spells.length > 0 && (
        <Text size="sm" fw={600} aria-live="polite">
          {t('wizard.spellsCount', {
            cantrips,
            spells: build.spells.length - cantrips,
            prepared,
          })}
        </Text>
      )}
      {build.spells.map((spell) => (
        <Paper key={spell.id} p="sm" className="sheet-block">
          <Stack gap="xs">
            <Group align="flex-end" gap="xs" wrap="nowrap">
              <TextInput
                className="grow-input"
                required
                maxLength={100}
                label={t('wizard.spellName')}
                value={spell.name}
                onChange={(event) => patch(spell.id, { name: event.currentTarget.value })}
              />
              <NativeSelect
                label={t('wizard.spellLevel')}
                value={String(spell.level)}
                data={Array.from({ length: 10 }, (_, level) => ({
                  value: String(level),
                  label: level === 0 ? t('wizard.cantrip') : String(level),
                }))}
                onChange={(event) => patch(spell.id, { level: Number(event.currentTarget.value) })}
              />
              <ActionIcon
                size={44}
                variant="subtle"
                color="red"
                aria-label={t('wizard.remove', { name: spell.name || t('wizard.untitled') })}
                onClick={() =>
                  update((current) => ({
                    ...current,
                    spells: current.spells.filter((item) => item.id !== spell.id),
                  }))
                }
              >
                <Trash2 size={18} aria-hidden="true" />
              </ActionIcon>
            </Group>
            {maxSpellLevel > 0 && spell.level > maxSpellLevel && (
              <Text size="sm" className="wizard-warn" role="note">
                {t('wizard.spellTooHigh', { max: maxSpellLevel })}
              </Text>
            )}
            <Group gap="md">
              <Checkbox
                label={t('sheet.concentration')}
                checked={spell.concentration}
                onChange={(event) =>
                  patch(spell.id, { concentration: event.currentTarget.checked })
                }
              />
              <Checkbox
                label={t('sheet.ritual')}
                checked={spell.ritual}
                onChange={(event) => patch(spell.id, { ritual: event.currentTarget.checked })}
              />
              <Checkbox
                label={t('sheet.prepared')}
                checked={spell.prepared}
                onChange={(event) => patch(spell.id, { prepared: event.currentTarget.checked })}
              />
            </Group>
            <Textarea
              autosize
              minRows={1}
              maxLength={600}
              label={t('wizard.spellNotes')}
              value={spell.notes}
              onChange={(event) => patch(spell.id, { notes: event.currentTarget.value })}
            />
          </Stack>
        </Paper>
      ))}
      <Group gap="xs">
        <Button
          variant="light"
          leftSection={<BookOpen size={16} aria-hidden="true" />}
          disabled={build.spells.length >= 100}
          onClick={() => setPicking(true)}
        >
          {t('panel.fromLibrary')}
        </Button>
        <Button
          variant="light"
          leftSection={<Plus size={16} aria-hidden="true" />}
          disabled={build.spells.length >= 100}
          onClick={() =>
            update((current) => ({
              ...current,
              spells: [
                ...current.spells,
                {
                  id: newId(),
                  name: '',
                  level: 0,
                  concentration: false,
                  ritual: false,
                  prepared: false,
                  notes: '',
                },
              ],
            }))
          }
        >
          {t('wizard.addSpell')}
        </Button>
      </Group>
      <LibraryPicker
        opened={picking}
        onClose={() => setPicking(false)}
        tab={tab}
        onTab={setTab}
        props={{
          build,
          level: props.draft.level,
          pending: false,
          change: (apply) => props.setDraft((current) => apply(current)),
        }}
      />
    </Stack>
  )
}

function DetailsStep(props: StepProps) {
  const { t } = useTranslation()
  const update = useBuild(props)
  const labels = useCharacterLabels()
  const { draft } = props
  const { build } = draft
  // RYT-072: alignment, languages and appearance moved to the sheet's Notes block.
  const text = (field: 'proficiencies' | 'notes') => ({
    value: build[field],
    onChange: (event: { currentTarget: { value: string } }) => {
      const value = event.currentTarget.value
      update((current) => ({ ...current, [field]: value }))
    },
  })
  const { session } = props
  const library = useSrdLibrary()
  const names = useResourceNames()
  const trackerLabel = useTrackerLabel()
  // The review shows what finishing will produce: class resources and features included.
  const preview = useMemo(
    () =>
      normalizeDraft(
        library
          ? {
              ...draft,
              build: syncProgression(
                { ...draft.build, origin: draft.build.origin ?? 'full' },
                draft.level,
                library.features,
                names,
              ),
            }
          : draft,
      ),
    [draft, library, names],
  )
  return (
    <Stack gap="md">
      {!session.editing && (
        <TextInput
          required
          maxLength={100}
          label={t('creation.name')}
          value={session.name}
          error={session.name.trim() ? undefined : t('creation.nameRequired')}
          onChange={(event) => session.setName(event.currentTarget.value)}
        />
      )}
      <BuildSummary draft={preview} title={t('wizard.review')} />
      <Text size="sm" c="dimmed">
        {t('wizard.reviewLine', {
          class: labels.className(build),
          level: draft.level,
          species: labels.speciesName(build),
          background: labels.backgroundName(build),
        })}
      </Text>
      {session.gaps.length > 0 && (
        <section aria-labelledby="wizard-gaps" className="wizard-gaps">
          <Title order={2} size="h4" id="wizard-gaps">
            {t('wizard.gaps.title')}
          </Title>
          <ul className="wizard-loss-list">
            {session.gaps.map(({ step, gap }) => (
              <li key={`${step}-${gap.kind}`}>
                <span>
                  {gap.kind === 'bonuses'
                    ? t('wizard.gap.bonuses')
                    : t('wizard.gap.skills', { count: gap.missing })}
                </span>{' '}
                <Button variant="subtle" size="compact-md" onClick={() => session.goTo(step)}>
                  {t('wizard.gaps.goTo', { step: t(`wizard.step.${step}`) })}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Textarea
        autosize
        minRows={2}
        maxLength={1000}
        label={t('wizard.proficiencies')}
        {...text('proficiencies')}
      />
      <section aria-labelledby="wizard-features">
        <Title order={2} size="h4" id="wizard-features" mb="xs">
          {t('wizard.features')}
        </Title>
        <Stack gap="xs">
          {build.features.map((feature) => (
            <Paper key={feature.id} p="sm" className="sheet-block">
              <Stack gap="xs">
                <Group align="flex-end" gap="xs" wrap="nowrap">
                  <TextInput
                    className="grow-input"
                    required
                    maxLength={100}
                    label={t('wizard.featureName')}
                    value={feature.name}
                    onChange={(event) => {
                      const name = event.currentTarget.value
                      update((current) => ({
                        ...current,
                        features: current.features.map((item) =>
                          item.id === feature.id ? { ...item, name } : item,
                        ),
                      }))
                    }}
                  />
                  <ActionIcon
                    size={44}
                    variant="subtle"
                    color="red"
                    aria-label={t('wizard.remove', { name: feature.name || t('wizard.untitled') })}
                    onClick={() =>
                      update((current) => ({
                        ...current,
                        features: current.features.filter((item) => item.id !== feature.id),
                      }))
                    }
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </ActionIcon>
                </Group>
                <NativeSelect
                  label={t('wizard.featureSource')}
                  value={feature.source}
                  data={featureSources.map((source) => ({
                    value: source,
                    label: t(`sheet.featureSource.${source}`),
                  }))}
                  onChange={(event) => {
                    const source = event.currentTarget.value as (typeof featureSources)[number]
                    update((current) => ({
                      ...current,
                      features: current.features.map((item) =>
                        item.id === feature.id ? { ...item, source } : item,
                      ),
                    }))
                  }}
                />
                <Textarea
                  autosize
                  minRows={1}
                  maxLength={2000}
                  label={t('wizard.featureDescription')}
                  value={feature.description}
                  onChange={(event) => {
                    const description = event.currentTarget.value
                    update((current) => ({
                      ...current,
                      features: current.features.map((item) =>
                        item.id === feature.id ? { ...item, description } : item,
                      ),
                    }))
                  }}
                />
              </Stack>
            </Paper>
          ))}
          <Button
            variant="light"
            leftSection={<Plus size={16} aria-hidden="true" />}
            disabled={build.features.length >= 60}
            onClick={() =>
              update((current) => ({
                ...current,
                features: [
                  ...current.features,
                  { id: newId(), name: '', source: 'class', description: '' },
                ],
              }))
            }
          >
            {t('wizard.addFeature')}
          </Button>
        </Stack>
      </section>
      <section aria-labelledby="wizard-trackers">
        <Title order={2} size="h4" id="wizard-trackers">
          {t('wizard.trackers')}
        </Title>
        <Text size="sm" c="dimmed" mb="xs">
          {t('wizard.trackersHint')}
        </Text>
        <Stack gap="xs">
          {build.trackers.map((tracker) => {
            const patch = (change: Partial<typeof tracker>) =>
              update((current) => ({
                ...current,
                trackers: current.trackers.map((item) =>
                  item.id === tracker.id ? { ...item, ...change } : item,
                ),
              }))
            return (
              <Paper key={tracker.id} p="sm" className="sheet-block">
                <Group align="flex-end" gap="xs">
                  <TextInput
                    className="grow-input"
                    required
                    maxLength={60}
                    label={t('wizard.trackerName')}
                    value={trackerLabel(tracker)}
                    // Typing over a class resource's name makes it the player's own.
                    onChange={(event) => patch({ name: event.currentTarget.value, key: undefined })}
                  />
                  <NumberInput
                    hideControls
                    w={88}
                    label={t('wizard.trackerMax')}
                    min={1}
                    max={20}
                    allowDecimal={false}
                    allowNegative={false}
                    value={tracker.max}
                    onChange={(value) =>
                      patch({ max: Math.min(20, Math.max(1, asInt(value, tracker.max))) })
                    }
                  />
                  <NativeSelect
                    label={t('wizard.trackerReset')}
                    value={tracker.reset}
                    data={restKinds.map((kind) => ({
                      value: kind,
                      label: t(`sheet.reset.${kind}`),
                    }))}
                    onChange={(event) =>
                      patch({ reset: event.currentTarget.value as (typeof restKinds)[number] })
                    }
                  />
                  <ActionIcon
                    size={44}
                    variant="subtle"
                    color="red"
                    aria-label={t('wizard.remove', {
                      name: trackerLabel(tracker) || t('wizard.untitled'),
                    })}
                    onClick={() =>
                      update((current) => ({
                        ...current,
                        trackers: current.trackers.filter((item) => item.id !== tracker.id),
                      }))
                    }
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </ActionIcon>
                </Group>
              </Paper>
            )
          })}
          <Button
            variant="light"
            leftSection={<Plus size={16} aria-hidden="true" />}
            disabled={build.trackers.length >= 30}
            onClick={() =>
              update((current) => ({
                ...current,
                trackers: [...current.trackers, { id: newId(), name: '', max: 1, reset: 'long' }],
              }))
            }
          >
            {t('wizard.addTracker')}
          </Button>
        </Stack>
      </section>
      <Textarea autosize minRows={3} maxLength={4000} label={t('sheet.notes')} {...text('notes')} />
    </Stack>
  )
}
