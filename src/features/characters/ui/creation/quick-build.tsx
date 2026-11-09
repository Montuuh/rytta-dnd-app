import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Alert, Button, Group, Progress, Stack, Text, TextInput, Title } from '@mantine/core'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '../sheet/panel.css'
import { Link } from 'react-router'
import { useCampaign } from '@/features/campaigns'
import { useSrdLibrary } from '@/features/glossary'
import { CharacterPortrait } from '@/features/inventory'
import { quickDraft } from '../../domain/quick'
import {
  finalAbilities,
  modifier,
  passivePerception,
  proficiencyBonus,
  signed,
  initiative,
} from '../../domain/rules'
import type { SheetRow } from '../../domain/sheet'
import { useCreateSheet } from './use-create-sheet'
import {
  abilityKeys,
  classKeys,
  classes,
  speciesKeys,
  species,
  type ClassKey,
  type SpeciesKey,
} from '../../domain/srd'
import { useCharacterLabels } from '../labels'

const steps = ['class', 'species', 'name'] as const

/** RYT-072 quick build: class, species, then name and portrait, with what Rytta prepared. */
export function QuickBuild({
  sheet,
  name: characterName,
  sheetPath,
}: {
  sheet: SheetRow
  name: string
  sheetPath: string
}) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const library = useSrdLibrary()
  const labels = useCharacterLabels()
  const [step, setStep] = useState(0)
  const [classKey, setClassKey] = useState<ClassKey>('fighter')
  const [speciesKey, setSpeciesKey] = useState<SpeciesKey>('human')
  const [name, setName] = useState(characterName)
  const heading = useRef<HTMLHeadingElement>(null)
  const { create, action } = useCreateSheet(sheet, characterName, sheetPath)
  const groupId = useId()
  useEffect(() => heading.current?.focus(), [step])
  const draft = useMemo(
    () =>
      library
        ? quickDraft({
            classKey,
            classLabel: t(`srd.class.${classKey}`),
            speciesKey,
            speciesLabel: t(`srd.species.${speciesKey}`),
            backgroundLabel: (key) => t(`srd.background.${key}`),
            name: (kind, key) => t(`srd.${kind}.${key}` as 'srd.trait.luck'),
            library: library.features,
            names: { resource: (key) => t(`panel.resource.${key}` as 'panel.resource.monk-focus') },
          })
        : null,
    [library, classKey, speciesKey, t],
  )
  const current = steps[step]!
  const last = step === steps.length - 1
  return (
    <Stack gap="md" className="creation-wizard quick-build">
      <Button
        component={Link}
        to={sheetPath}
        variant="subtle"
        leftSection={<ArrowLeft size={18} aria-hidden="true" />}
        className="sheet-back"
        w="fit-content"
      >
        {t('sheet.title')}
      </Button>
      <div>
        <Text className="user-copy" c="dimmed">
          {t('creation.quickTitle', { name: characterName })}
        </Text>
        <Title order={1} ref={heading} tabIndex={-1}>
          {t(`creation.quickStep.${current}`)}
        </Title>
        <Text size="sm" c="dimmed" mt={4}>
          {t('wizard.progress', { current: step + 1, total: steps.length })}
        </Text>
        <Progress value={((step + 1) / steps.length) * 100} size="sm" mt="xs" aria-hidden="true" />
      </div>
      {current === 'class' && (
        <div role="radiogroup" aria-label={t('wizard.class')} className="choice-grid">
          {classKeys.map((key) => (
            <label key={key} className="choice-tile" data-checked={classKey === key || undefined}>
              <input
                type="radio"
                name={`${groupId}-class`}
                className="creation-door-input"
                checked={classKey === key}
                onChange={() => setClassKey(key)}
              />
              <span className="choice-tile-name">{t(`srd.class.${key}`)}</span>
              <span className="choice-tile-meta">
                {t('creation.hitDie', { die: classes[key].hitDie })}
              </span>
            </label>
          ))}
        </div>
      )}
      {current === 'species' && (
        <div role="radiogroup" aria-label={t('wizard.species')} className="choice-grid">
          {speciesKeys.map((key) => (
            <label key={key} className="choice-tile" data-checked={speciesKey === key || undefined}>
              <input
                type="radio"
                name={`${groupId}-species`}
                className="creation-door-input"
                checked={speciesKey === key}
                onChange={() => setSpeciesKey(key)}
              />
              <span className="choice-tile-name">{t(`srd.species.${key}`)}</span>
              <span className="choice-tile-meta">
                {t('sheet.speedValue', { value: species[key].speed })}
              </span>
            </label>
          ))}
        </div>
      )}
      {current === 'name' && (
        <Stack gap="md">
          <Group align="flex-end" gap="lg" wrap="wrap">
            <CharacterPortrait
              campaignId={campaign.id}
              characterId={sheet.character_id}
              name={name || characterName}
              path={sheet.portrait_path ?? null}
              size={88}
              editable
            />
            <TextInput
              className="grow-input"
              label={t('creation.name')}
              maxLength={100}
              required
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              error={name.trim() ? undefined : t('creation.nameRequired')}
            />
          </Group>
          {draft && (
            <section className="quick-summary" aria-labelledby="quick-summary-title">
              <Title order={2} size="h4" id="quick-summary-title">
                {t('creation.prepared')}
              </Title>
              <ul className="ability-strip is-compact">
                {abilityKeys.map((key) => {
                  const score = finalAbilities(draft.build)[key]
                  const proficient = draft.build.saves.includes(key)
                  return (
                    <li
                      key={key}
                      className="ability-medal"
                      data-proficient={proficient || undefined}
                    >
                      <span className="ability-name">{t(`srd.abilityShort.${key}`)}</span>
                      <span className="ability-mod">{signed(modifier(score))}</span>
                      <span className="ability-score">{score}</span>
                      {proficient && (
                        <span className="visually-hidden">{t('panel.saveProficientShort')}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
              <dl className="quick-facts">
                <div>
                  <dt>{t('creation.factOrigin')}</dt>
                  <dd>
                    {labels.speciesName(draft.build)}, {labels.backgroundName(draft.build)}
                  </dd>
                </div>
                <div>
                  <dt>{t('sheet.hp')}</dt>
                  <dd>{draft.maxHp}</dd>
                </div>
                <div>
                  <dt>{t('sheet.acLong')}</dt>
                  <dd>{draft.armorClass}</dd>
                </div>
                <div>
                  <dt>{t('creation.factBasics')}</dt>
                  <dd>
                    {t('creation.basics', {
                      init: signed(initiative(draft.build)),
                      speed: draft.build.speed,
                      prof: signed(proficiencyBonus(1)),
                      pp: passivePerception(draft.build, 1),
                    })}
                  </dd>
                </div>
                <div>
                  <dt>{t('sheet.skills')}</dt>
                  <dd>
                    {Object.keys(draft.build.skills)
                      .map((skill) => t(`srd.skill.${skill as 'stealth'}`))
                      .join(', ')}
                  </dd>
                </div>
                <div>
                  <dt>{t('panel.resourcesTitle')}</dt>
                  <dd>
                    {draft.build.trackers.length
                      ? draft.build.trackers
                          .map((tracker) => `${tracker.name} ${tracker.max}`)
                          .join(', ')
                      : t('creation.noResourcesYet')}
                  </dd>
                </div>
                <div>
                  <dt>{t('sheet.features')}</dt>
                  <dd>{draft.build.features.map((feature) => feature.name).join(', ')}</dd>
                </div>
              </dl>
              <Text size="sm" c="dimmed">
                {t('creation.preparedHint')}
              </Text>
            </section>
          )}
        </Stack>
      )}
      {action.isError && (
        <Alert color="red" role="alert">
          {t(
            action.error.message === 'stale'
              ? 'sheet.stale'
              : action.error.message === 'forbidden'
                ? 'sheet.forbidden'
                : 'sheet.unavailable',
          )}
        </Alert>
      )}
      <Group justify="space-between" wrap="nowrap" className="wizard-actions">
        <Button
          variant="default"
          disabled={step === 0 || action.isPending}
          onClick={() => setStep(step - 1)}
        >
          {t('wizard.back')}
        </Button>
        <Button
          loading={action.isPending}
          disabled={last && (!draft || !name.trim())}
          onClick={() =>
            last ? draft && void create(draft, name).catch(() => undefined) : setStep(step + 1)
          }
        >
          {t(last ? 'creation.create' : 'wizard.next')}
        </Button>
      </Group>
    </Stack>
  )
}
