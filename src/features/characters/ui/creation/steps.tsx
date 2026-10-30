import type { Dispatch, SetStateAction } from 'react'
import {
  ActionIcon,
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
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  chooseBackground,
  chooseClass,
  chooseSpecies,
  classSkillChoices,
  pointBuyStart,
  suggestedHpFor,
  type CreationStep,
} from '../../domain/creation'
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
  classKeys,
  classes,
  hitDice,
  pointBuyBudget,
  skillKeys,
  species,
  speciesKeys,
  standardArray,
  type Ability,
  type Skill,
} from '../../domain/srd'
import { useCharacterLabels } from '../labels'

type StepProps = { draft: SheetDraft; setDraft: Dispatch<SetStateAction<SheetDraft>> }
const newId = () => crypto.randomUUID()

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

function ClassStep(props: StepProps) {
  const { t } = useTranslation()
  const { draft, setDraft } = props
  const update = useBuild(props)
  const { build } = draft
  const shortSaves = (saves: readonly Ability[]) =>
    saves.map((key) => t(`srd.abilityShort.${key}`)).join(', ')
  return (
    <Stack gap="md">
      <Radio.Group
        label={t('wizard.class')}
        description={t('wizard.classHint')}
        value={build.classKey}
        onChange={(key) =>
          update((current) =>
            chooseClass(
              current,
              key,
              key === 'custom' ? current.classLabel : t(`srd.class.${key}` as 'srd.class.bard'),
            ),
          )
        }
      >
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="xs" mt="xs">
          {classKeys.map((key) => (
            <Radio.Card key={key} value={key} p="sm" className="choice-card">
              <Group wrap="nowrap" align="flex-start" gap="sm">
                <Radio.Indicator />
                <div>
                  <Text fw={600}>{t(`srd.class.${key}`)}</Text>
                  <Text size="sm" c="dimmed">
                    {t('wizard.classCard', {
                      die: classes[key].hitDie,
                      saves: shortSaves(classes[key].saves),
                    })}
                  </Text>
                </div>
              </Group>
            </Radio.Card>
          ))}
          <Radio.Card value="custom" p="sm" className="choice-card">
            <Group wrap="nowrap" align="flex-start" gap="sm">
              <Radio.Indicator />
              <Text fw={600}>{t('srd.custom')}</Text>
            </Group>
          </Radio.Card>
        </SimpleGrid>
      </Radio.Group>
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
        <NumberInput
          hideControls
          label={t('wizard.level')}
          min={1}
          max={20}
          allowDecimal={false}
          allowNegative={false}
          value={draft.level}
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              level: Math.min(20, Math.max(1, asInt(value, current.level))),
            }))
          }
        />
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
      <TextInput
        maxLength={500}
        label={t('wizard.languages')}
        value={build.languages}
        onChange={(event) => {
          const languages = event.currentTarget.value
          update((current) => ({ ...current, languages }))
        }}
      />
    </Stack>
  )
}

function AbilitiesStep(props: StepProps) {
  const { t } = useTranslation()
  const update = useBuild(props)
  const { build } = props.draft
  const totals = finalAbilities(build)
  const spent = pointBuySpent(build.baseAbilities)
  const setScore = (key: Ability, value: number) =>
    update((current) => ({
      ...current,
      baseAbilities: { ...current.baseAbilities, [key]: value },
    }))
  const method = build.abilityMethod
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
          update((current) => ({
            ...current,
            abilityMethod: next,
            baseAbilities:
              next === 'pointBuy'
                ? pointBuyStart()
                : next === 'standard'
                  ? { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }
                  : current.baseAbilities,
          }))
        }}
      />
      <Text size="sm" c="dimmed" aria-live="polite">
        {method === 'standard'
          ? t('wizard.standardHint')
          : method === 'pointBuy'
            ? t('wizard.pointBuyHint', {
                left: spent === null ? '—' : pointBuyBudget - spent,
                total: pointBuyBudget,
              })
            : t('wizard.manualHint')}
      </Text>
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
        {abilityKeys.map((key) => {
          const label = t(`srd.ability.${key}`)
          const description = t('wizard.finalScore', {
            score: totals[key],
            mod: signed(modifier(totals[key])),
          })
          return method === 'standard' ? (
            <NativeSelect
              key={key}
              label={label}
              description={description}
              value={String(build.baseAbilities[key])}
              data={[...new Set([...standardArray, build.baseAbilities[key]])].map((value) => ({
                value: String(value),
                label: String(value),
              }))}
              onChange={(event) => setScore(key, Number(event.currentTarget.value))}
            />
          ) : (
            <NumberInput
              hideControls
              key={key}
              label={label}
              description={description}
              min={method === 'pointBuy' ? 8 : 1}
              max={method === 'pointBuy' ? 15 : 30}
              allowDecimal={false}
              allowNegative={false}
              value={build.baseAbilities[key]}
              onChange={(value) =>
                setScore(
                  key,
                  Math.min(
                    method === 'pointBuy' ? 15 : 30,
                    Math.max(method === 'pointBuy' ? 8 : 1, asInt(value, build.baseAbilities[key])),
                  ),
                )
              }
            />
          )
        })}
      </SimpleGrid>
    </Stack>
  )
}

function SkillsStep(props: StepProps) {
  const { t } = useTranslation()
  const update = useBuild(props)
  const { build } = props.draft
  const { fixed, picked, count, options } = classSkillChoices(build)
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
  const unarmored = defaultArmorClass(draft.build)
  return (
    <Stack gap="md">
      <Group align="flex-end" gap="sm">
        <NumberInput
          hideControls
          className="grow-input"
          label={t('wizard.maxHp')}
          description={t('wizard.suggested', { value: suggested })}
          min={1}
          max={9999}
          allowDecimal={false}
          allowNegative={false}
          value={draft.maxHp}
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              maxHp: Math.min(9999, Math.max(1, asInt(value, current.maxHp))),
            }))
          }
        />
        <Button
          variant="light"
          disabled={draft.maxHp === suggested}
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
  const slots = slotsFor(build.casterKind, props.draft.level)
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
    </Stack>
  )
}

function DetailsStep(props: StepProps) {
  const { t } = useTranslation()
  const update = useBuild(props)
  const labels = useCharacterLabels()
  const { draft } = props
  const { build } = draft
  const text = (field: 'alignment' | 'appearance' | 'proficiencies' | 'notes') => ({
    value: build[field],
    onChange: (event: { currentTarget: { value: string } }) => {
      const value = event.currentTarget.value
      update((current) => ({ ...current, [field]: value }))
    },
  })
  return (
    <Stack gap="md">
      <Paper p="md" className="sheet-block">
        <Title order={2} size="h4">
          {t('wizard.review')}
        </Title>
        <Text mt={4}>
          {t('wizard.reviewLine', {
            class: labels.className(build),
            level: draft.level,
            species: labels.speciesName(build),
            background: labels.backgroundName(build),
          })}
        </Text>
        <Text size="sm" c="dimmed">
          {t('sheet.hpSummary', { value: draft.maxHp })},{' '}
          {t('sheet.acSummary', { value: build.acOverride ?? defaultArmorClass(build) })}
        </Text>
      </Paper>
      <TextInput maxLength={40} label={t('sheet.alignment')} {...text('alignment')} />
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
                    value={tracker.name}
                    onChange={(event) => patch({ name: event.currentTarget.value })}
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
                    aria-label={t('wizard.remove', { name: tracker.name || t('wizard.untitled') })}
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
      <Textarea
        autosize
        minRows={2}
        maxLength={2000}
        label={t('sheet.appearance')}
        {...text('appearance')}
      />
      <Textarea autosize minRows={3} maxLength={4000} label={t('sheet.notes')} {...text('notes')} />
    </Stack>
  )
}
