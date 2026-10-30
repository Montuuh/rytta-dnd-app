import { useState } from 'react'
import {
  Accordion,
  Badge,
  Button,
  Checkbox,
  CloseButton,
  Group,
  Modal,
  NativeSelect,
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
import { Pips } from './pips'
import type { SheetProps } from './vitals-panel'

export function SummaryTab({ build, sheet, vitals, canEdit, pending, commit }: SheetProps) {
  const { t } = useTranslation()
  const scores = finalAbilities(build)
  const hitDiceLeft = sheet.level - vitals.hit_dice_spent
  const available = conditionKeys.filter((key) => !vitals.conditions.includes(key))
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
                    <abbr title={t(`srd.ability.${key}`)} aria-hidden="true">
                      {t(`srd.abilityShort.${key}`)}
                    </abbr>
                    <span className="visually-hidden">{t(`srd.ability.${key}`)}</span>
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
                <Text fw={600}>{t('sheet.hitDice')}</Text>
                <Text size="sm" c="dimmed">
                  {t('sheet.hitDiceValue', {
                    left: hitDiceLeft,
                    total: sheet.level,
                    die: build.hitDie,
                  })}
                </Text>
              </div>
              {canEdit && (
                <Group gap="xs">
                  <Button
                    variant="default"
                    aria-label={t('sheet.spendHitDieLabel')}
                    disabled={pending || hitDiceLeft <= 0}
                    onClick={() => commit({ ...vitals, hit_dice_spent: vitals.hit_dice_spent + 1 })}
                  >
                    {t('sheet.spendHitDie')}
                  </Button>
                  <Button
                    variant="subtle"
                    aria-label={t('sheet.recoverHitDieLabel')}
                    disabled={pending || vitals.hit_dice_spent <= 0}
                    onClick={() => commit({ ...vitals, hit_dice_spent: vitals.hit_dice_spent - 1 })}
                  >
                    {t('sheet.recoverHitDie')}
                  </Button>
                </Group>
              )}
            </Group>
            {canEdit && (
              <Text size="xs" c="dimmed">
                {t('sheet.spendHint')}
              </Text>
            )}
          </Stack>
        </Paper>
        <Paper p="md" className="sheet-block">
          <Text fw={600} mb="xs">
            {t('sheet.deathSaves')}
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
            <Text fw={600}>{t('sheet.conditions')}</Text>
            {vitals.conditions.length === 0 ? (
              <Text size="sm" c="dimmed">
                {t('sheet.noConditions')}
              </Text>
            ) : (
              <Group gap="xs">
                {vitals.conditions.map((key) => (
                  <Badge
                    key={key}
                    size="lg"
                    variant="outline"
                    className="condition-badge"
                    rightSection={
                      canEdit ? (
                        <CloseButton
                          size={36}
                          aria-label={t('sheet.removeCondition', {
                            name: t(`srd.condition.${key}`),
                          })}
                          disabled={pending}
                          onClick={() =>
                            commit({
                              ...vitals,
                              conditions: vitals.conditions.filter((item) => item !== key),
                            })
                          }
                        />
                      ) : undefined
                    }
                  >
                    {t(`srd.condition.${key}`)}
                  </Badge>
                ))}
              </Group>
            )}
            {canEdit && available.length > 0 && (
              <NativeSelect
                label={t('sheet.addCondition')}
                value=""
                disabled={pending}
                data={[
                  { value: '', label: '—' },
                  ...available.map((key) => ({ value: key, label: t(`srd.condition.${key}`) })),
                ]}
                onChange={(event) => {
                  const key = event.currentTarget.value as (typeof conditionKeys)[number]
                  if (key) commit({ ...vitals, conditions: [...vitals.conditions, key] })
                }}
              />
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
                  {t(`srd.skill.${skill}`)}
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
  return (
    <Stack gap="md">
      {canEdit && (
        <Group gap="xs" grow>
          <Button
            variant="default"
            leftSection={<Sunset size={16} aria-hidden="true" />}
            disabled={pending}
            onClick={() => setRest('short')}
          >
            {t('sheet.shortRest')}
          </Button>
          <Button
            variant="default"
            leftSection={<Moon size={16} aria-hidden="true" />}
            disabled={pending}
            onClick={() => setRest('long')}
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
                          {feature.description || t('sheet.noDescription')}
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
          onClose={() => setRest(null)}
          title={t(rest === 'short' ? 'sheet.shortRest' : 'sheet.longRest')}
          closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
        >
          <Stack>
            <Text>{t(`sheet.restConfirm.${rest}`)}</Text>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setRest(null)}>
                {t('action.cancel')}
              </Button>
              <Button
                data-autofocus
                onClick={() => {
                  onRest(applyRest(vitals, build, sheet.max_hp, rest))
                  setRest(null)
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
            <dt>{t('sheet.spellDc')}</dt>
            <dd>{casting.saveDc}</dd>
          </div>
          <div className="sheet-stat">
            <dt>{t('sheet.spellAttack')}</dt>
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
                          {spell.notes || t('sheet.noDescription')}
                        </Text>
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
            {value || t('sheet.unset')}
          </Text>
        </section>
      ))}
    </Stack>
  )
}
