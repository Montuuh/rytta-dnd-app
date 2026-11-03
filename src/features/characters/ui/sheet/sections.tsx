import { useRef, useState } from 'react'
import {
  Accordion,
  Badge,
  Button,
  Checkbox,
  Chip,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { Moon, Sunset } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  applyRest,
  finalAbilities,
  modifier,
  saveBonus,
  signed,
  skillBonus,
  slotsFor,
  spellcasting,
} from '../../domain/rules'
import { featureSources, type Vitals } from '../../domain/sheet'
import { abilityKeys, conditionKeys, skillAbilities, skillKeys } from '../../domain/srd'
import { GlossaryNameLink, GlossaryTerm, GlossaryText, glossaryIds } from '@/features/glossary'
import { Pips } from './pips'
import type { SheetProps } from './vitals-panel'

export function SummaryTab({ build, sheet, vitals, canEdit, pending, commit }: SheetProps) {
  const { t } = useTranslation()
  const scores = finalAbilities(build)
  const hitDiceLeft = sheet.level - vitals.hit_dice_spent
  return (
    <div className="sheet-columns">
      <Stack gap="md">
        <section aria-labelledby="abilities-title">
          <Title order={2} size="h4" id="abilities-title" mb="xs">
            {t('sheet.abilities')}
          </Title>
          <SimpleGrid cols={3} spacing="xs" className="ability-grid">
            {abilityKeys.map((key) => {
              const proficient = build.saves.includes(key)
              const save = signed(saveBonus(build, sheet.level, key))
              return (
                <div key={key} className="ability-tile" data-proficient={proficient || undefined}>
                  <span className="ability-name">
                    <GlossaryTerm id={glossaryIds.ability(key)}>
                      <abbr title={t(`srd.ability.${key}`)} aria-hidden="true">
                        {t(`srd.abilityShort.${key}`)}
                      </abbr>
                      <span className="visually-hidden">{t(`srd.ability.${key}`)}</span>
                    </GlossaryTerm>
                  </span>
                  <span className="ability-mod">{signed(modifier(scores[key]))}</span>
                  <Text size="sm" c="dimmed">
                    {scores[key]}
                  </Text>
                  <Text
                    size="xs"
                    className="ability-save"
                    aria-label={`${t('sheet.saveLabel', { ability: t(`srd.ability.${key}`), value: save })}${proficient ? `, ${t('sheet.proficient')}` : ''}`}
                  >
                    {t('sheet.saveShort')} {save}
                    {proficient && <span aria-hidden="true"> ●</span>}
                  </Text>
                </div>
              )
            })}
          </SimpleGrid>
        </section>
        <Paper p="md" className="sheet-block">
          <Stack gap="sm">
            <Group justify="space-between" wrap="wrap" gap="xs">
              <div>
                <Text fw={600}>
                  <GlossaryTerm id="rule.hit-point-dice">{t('sheet.hitDice')}</GlossaryTerm>
                </Text>
                <Text size="sm" c="dimmed">
                  {t('sheet.hitDiceValue', {
                    left: hitDiceLeft,
                    total: sheet.level,
                    die: build.hitDie,
                  })}
                </Text>
              </div>
            </Group>
            <Pips
              max={sheet.level}
              used={vitals.hit_dice_spent}
              disabled={!canEdit || pending}
              spendLabel={t('sheet.spendHitDieLabel')}
              restoreLabel={t('sheet.recoverHitDieLabel')}
              countLabel={`${hitDiceLeft}/${sheet.level}`}
              glyph={`d${build.hitDie}`}
              onChange={(used) => commit({ ...vitals, hit_dice_spent: used })}
            />
            {canEdit && (
              <Text size="xs" c="dimmed">
                {t('sheet.spendHint')}
              </Text>
            )}
          </Stack>
        </Paper>
        <Paper p="md" className="sheet-block">
          <Text fw={600} mb="xs">
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
                  disabled={!canEdit || pending}
                  spendLabel={`${label}: −1`}
                  restoreLabel={`${label}: +1`}
                  countLabel={`${vitals[field]}/3`}
                  onChange={(used) => commit({ ...vitals, [field]: 3 - used })}
                />
              </Group>
            )
          })}
        </Paper>
        <Paper p="md" className="sheet-block">
          <Stack gap="sm">
            <Checkbox
              size="md"
              label={t('sheet.inspiration')}
              checked={vitals.heroic_inspiration}
              disabled={!canEdit || pending}
              onChange={(event) =>
                commit({ ...vitals, heroic_inspiration: event.currentTarget.checked })
              }
            />
            <Text fw={600} id="conditions-title">
              <GlossaryTerm id="rule.condition">{t('sheet.conditions')}</GlossaryTerm>
            </Text>
            {canEdit ? (
              <>
                <Text size="sm" c="dimmed">
                  {vitals.conditions.length === 0
                    ? t('sheet.noConditions')
                    : t('sheet.conditionsHint')}
                </Text>
                {vitals.conditions.length > 0 && (
                  // The chips toggle; the active conditions stay one tap from their rules.
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
                <Chip.Group
                  multiple
                  value={[...vitals.conditions]}
                  onChange={(next) =>
                    commit({
                      ...vitals,
                      conditions: conditionKeys.filter((key) => next.includes(key)),
                    })
                  }
                >
                  <div className="condition-chips" role="group" aria-labelledby="conditions-title">
                    {conditionKeys.map((key) => (
                      <Chip key={key} value={key} disabled={pending} className="condition-chip">
                        {t(`srd.condition.${key}`)}
                      </Chip>
                    ))}
                  </div>
                </Chip.Group>
              </>
            ) : vitals.conditions.length === 0 ? (
              <Text size="sm" c="dimmed">
                {t('sheet.noConditions')}
              </Text>
            ) : (
              <Group gap="xs">
                {vitals.conditions.map((key) => (
                  <Badge key={key} size="lg" variant="outline" className="condition-badge">
                    <GlossaryTerm id={glossaryIds.condition(key)}>
                      {t(`srd.condition.${key}`)}
                    </GlossaryTerm>
                  </Badge>
                ))}
              </Group>
            )}
          </Stack>
        </Paper>
      </Stack>
      <section aria-labelledby="skills-title">
        <Title order={2} size="h4" id="skills-title" mb="xs">
          {t('sheet.skills')}
        </Title>
        <ul className="skill-list">
          {skillKeys.map((skill) => {
            const level = build.skills[skill]
            return (
              <li key={skill} className="skill-row" data-level={level}>
                <span className="skill-marker" aria-hidden="true">
                  {level === 'expertise'
                    ? t('sheet.expertiseShort')
                    : level === 'proficient'
                      ? t('sheet.proficientShort')
                      : ''}
                </span>
                <span className="skill-name">
                  <GlossaryTerm id={glossaryIds.skill(skill)}>
                    {t(`srd.skill.${skill}`)}
                  </GlossaryTerm>
                  {level && <span className="visually-hidden">, {t(`sheet.${level}`)}</span>}
                </span>
                <span className="skill-ability">
                  {t(`srd.abilityShort.${skillAbilities[skill]}`)}
                </span>
                <span className="skill-bonus">{signed(skillBonus(build, sheet.level, skill))}</span>
              </li>
            )
          })}
        </ul>
        <Text size="xs" c="dimmed" mt="xs">
          {t('sheet.proficientShort')} = {t('sheet.proficient')}, {t('sheet.expertiseShort')} ={' '}
          {t('sheet.expertise')}
        </Text>
      </section>
    </div>
  )
}

export function FeaturesTab({
  build,
  sheet,
  vitals,
  canEdit,
  pending,
  commit,
  onRest,
}: SheetProps & { onRest: (values: Vitals) => void }) {
  const { t } = useTranslation()
  const [rest, setRest] = useState<'short' | 'long' | null>(null)
  const restOpener = useRef<HTMLElement | null>(null)
  const openRest = (kind: 'short' | 'long', target: HTMLElement) => {
    restOpener.current = target
    setRest(kind)
  }
  // The dialog unmounts on close, so return focus to its opener explicitly.
  const closeRest = () => {
    setRest(null)
    requestAnimationFrame(() => restOpener.current?.focus())
  }
  return (
    <Stack gap="md">
      {canEdit && (
        // aria-disabled (not disabled) keeps the openers focusable while a rest saves.
        <Group gap="xs" grow>
          <Button
            variant="default"
            leftSection={<Sunset size={16} aria-hidden="true" />}
            aria-disabled={pending || undefined}
            onClick={(event) => {
              if (!pending) openRest('short', event.currentTarget)
            }}
          >
            {t('sheet.shortRest')}
          </Button>
          <Button
            variant="default"
            leftSection={<Moon size={16} aria-hidden="true" />}
            aria-disabled={pending || undefined}
            onClick={(event) => {
              if (!pending) openRest('long', event.currentTarget)
            }}
          >
            {t('sheet.longRest')}
          </Button>
        </Group>
      )}
      <section aria-labelledby="trackers-title">
        <Title order={2} size="h4" id="trackers-title" mb="xs">
          {t('sheet.trackers')}
        </Title>
        {build.trackers.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t('sheet.noTrackers')}
          </Text>
        ) : (
          <Stack gap="sm">
            {build.trackers.map((tracker) => {
              const used = Math.min(tracker.max, vitals.tracker_uses[tracker.id] ?? 0)
              return (
                <Paper key={tracker.id} p="sm" className="sheet-block">
                  <Group justify="space-between" gap="xs">
                    <Text fw={600} className="user-copy">
                      {tracker.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {t(`sheet.reset.${tracker.reset}`)}
                    </Text>
                  </Group>
                  <Pips
                    max={tracker.max}
                    used={used}
                    disabled={!canEdit || pending}
                    spendLabel={t('sheet.useOne', { name: tracker.name })}
                    restoreLabel={t('sheet.restoreOne', { name: tracker.name })}
                    countLabel={t('sheet.usesLeft', { left: tracker.max - used, max: tracker.max })}
                    onChange={(next) =>
                      commit({
                        ...vitals,
                        tracker_uses: { ...vitals.tracker_uses, [tracker.id]: next },
                      })
                    }
                  />
                </Paper>
              )
            })}
          </Stack>
        )}
      </section>
      <section aria-labelledby="features-title">
        <Title order={2} size="h4" id="features-title" mb="xs">
          {t('sheet.features')}
        </Title>
        {build.features.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t('sheet.noFeatures')}
          </Text>
        ) : (
          featureSources.map((source) => {
            const items = build.features.filter((feature) => feature.source === source)
            if (items.length === 0) return null
            return (
              <Stack key={source} gap={4} mb="sm">
                <Text size="sm" c="dimmed" fw={600}>
                  {t(`sheet.featureSource.${source}`)}
                </Text>
                <Accordion variant="separated" chevronPosition="right">
                  {items.map((feature) => (
                    <Accordion.Item key={feature.id} value={feature.id}>
                      <Accordion.Control className="user-copy">{feature.name}</Accordion.Control>
                      <Accordion.Panel>
                        <Text size="sm" className="user-copy preserve-lines">
                          {feature.description ? (
                            <GlossaryText text={feature.description} />
                          ) : (
                            t('sheet.noDescription')
                          )}
                        </Text>
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                </Accordion>
              </Stack>
            )
          })
        )}
      </section>
      {rest && (
        <Modal
          opened
          onClose={closeRest}
          title={t(rest === 'short' ? 'sheet.shortRest' : 'sheet.longRest')}
          closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
        >
          <Stack>
            <Text>{t(`sheet.restConfirm.${rest}`)}</Text>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeRest}>
                {t('action.cancel')}
              </Button>
              <Button
                data-autofocus
                disabled={pending}
                onClick={() => {
                  onRest(applyRest(vitals, build, sheet.max_hp, rest))
                  closeRest()
                }}
              >
                {t(rest === 'short' ? 'sheet.shortRest' : 'sheet.longRest')}
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </Stack>
  )
}

export function SpellsTab({ build, sheet, vitals, canEdit, pending, commit }: SheetProps) {
  const { t } = useTranslation()
  const casting = spellcasting(build, sheet.level)
  const slots = slotsFor(build.casterKind, sheet.level)
  const levels = Array.from(new Set(build.spells.map((spell) => spell.level))).sort((a, b) => a - b)
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
        <Text c="dimmed">{t('sheet.notCaster')}</Text>
      )}
      {slots.some((count) => count > 0) && (
        <section aria-labelledby="slots-title">
          <Title order={2} size="h4" id="slots-title" mb="xs">
            {t('sheet.slots')}
          </Title>
          <Stack gap={4}>
            {slots.map((max, index) => {
              if (max === 0) return null
              const level = index + 1
              const used = Math.min(max, vitals.slots_used[index] ?? 0)
              return (
                <Group key={level} gap="xs" wrap="nowrap">
                  <Text size="sm" w={72}>
                    {t('sheet.slotLevel', { level })}
                  </Text>
                  <Pips
                    max={max}
                    used={used}
                    disabled={!canEdit || pending}
                    spendLabel={t('sheet.useSlot', { level })}
                    restoreLabel={t('sheet.restoreSlot', { level })}
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
      {build.spells.length === 0
        ? build.casterKind !== 'none' && (
            <Text size="sm" c="dimmed">
              {t('sheet.noSpells')}
            </Text>
          )
        : levels.map((level) => (
            <section key={level} aria-labelledby={`spells-${level}`}>
              <Title order={2} size="h4" id={`spells-${level}`} mb="xs">
                {level === 0 ? t('sheet.cantrips') : t('sheet.slotLevel', { level })}
              </Title>
              <Accordion variant="separated">
                {build.spells
                  .filter((spell) => spell.level === level)
                  .map((spell) => (
                    <Accordion.Item key={spell.id} value={spell.id}>
                      <Accordion.Control>
                        <Group gap="xs" wrap="wrap">
                          <span className="user-copy">{spell.name}</span>
                          {spell.concentration && (
                            <Badge size="sm" variant="outline">
                              {t('sheet.concentration')}
                            </Badge>
                          )}
                          {spell.ritual && (
                            <Badge size="sm" variant="outline">
                              {t('sheet.ritual')}
                            </Badge>
                          )}
                          {spell.prepared && level > 0 && (
                            <Badge size="sm" variant="light">
                              {t('sheet.prepared')}
                            </Badge>
                          )}
                        </Group>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Text size="sm" className="user-copy preserve-lines">
                          {spell.notes ? (
                            <GlossaryText text={spell.notes} />
                          ) : (
                            t('sheet.noDescription')
                          )}
                        </Text>
                        <GlossaryNameLink name={spell.name} />
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
              </Accordion>
            </section>
          ))}
    </Stack>
  )
}

export function NotesTab({ build }: SheetProps) {
  const { t } = useTranslation()
  const rows = [
    ['sheet.alignment', build.alignment],
    ['sheet.languages', build.languages],
    ['sheet.otherProficiencies', build.proficiencies],
    ['sheet.appearance', build.appearance],
    ['sheet.notes', build.notes],
  ] as const
  return (
    <Stack gap="md">
      {rows.map(([label, value]) => (
        <section key={label}>
          <Text fw={600}>{t(label)}</Text>
          <Text size="sm" c={value ? undefined : 'dimmed'} className="user-copy preserve-lines">
            {value ? <GlossaryText text={value} /> : t('sheet.unset')}
          </Text>
        </section>
      ))}
    </Stack>
  )
}
