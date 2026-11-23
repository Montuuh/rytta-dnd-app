import { classDefFor, offeredClasses } from '../../domain/class-catalog'
import { isClassKey } from '../../domain/rules'
import { useClassCatalog, useOriginCatalog, useOriginNames } from '../class-catalog'
import { backgroundDefFor, offeredSpecies, speciesDefFor } from '../../domain/origin-catalog'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Alert, Button, Group, Progress, Stack, Text, TextInput, Title } from '@mantine/core'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CopyArtPrompt } from '@/shared/ui/copy-art-prompt'
import '../sheet/panel.css'
import { Link } from 'react-router'
import { useCampaign } from '@/features/campaigns'
import { useSrdLibrary } from '@/features/glossary'
import { CharacterPortrait } from '@/features/inventory'
import { quickBackground, quickDraft } from '../../domain/quick'
import type { SheetRow } from '../../domain/sheet'
import { useCreateSheet } from './use-create-sheet'
import type { ClassKey } from '../../domain/srd'
import { useResourceNames } from '../resource-names'
import { BuildSummary } from './build-summary'
import { classEmblem } from '../class-emblem'
import { ClassPicker } from './class-picker'
import { ClassesState } from './classes-state'
import { LibraryWait } from './library-wait'

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
  const names = useResourceNames()
  const [step, setStep] = useState(0)
  const [classKey, setClassKey] = useState<ClassKey | null>(null)
  // RYT-168: the quick path builds SRD archetypes; pack classes go through the full wizard.
  // RYT-171: an archetype needs its SRD background in the campaign's packs; species come from
  // every pack (owner choice P4 A).
  const catalog = useClassCatalog()
  const origins = useOriginCatalog()
  const originNames = useOriginNames()
  const quickClasses = useMemo(
    () =>
      (catalog ? offeredClasses(catalog) : []).filter(
        (item) =>
          item.srd &&
          isClassKey(item.key) &&
          backgroundDefFor(origins, quickBackground[item.key]) !== null,
      ),
    [catalog, origins],
  )
  const speciesList = useMemo(() => (origins ? offeredSpecies(origins) : []), [origins])
  const [speciesKey, setSpeciesKey] = useState<string | null>(null)
  const [name, setName] = useState(characterName)
  const [asked, setAsked] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const finishRef = useRef<HTMLButtonElement>(null)
  const { create, action } = useCreateSheet(sheet, characterName, sheetPath)
  const groupId = useId()
  useEffect(() => heading.current?.focus(), [step])
  const draft = useMemo(() => {
    const classDef = classKey ? classDefFor(catalog, classKey) : null
    const speciesDef = speciesKey ? speciesDefFor(origins, speciesKey) : null
    const backgroundDef = classKey ? backgroundDefFor(origins, quickBackground[classKey]) : null
    if (!library || !classKey || !classDef || !speciesDef || !backgroundDef) return null
    return quickDraft({
      classKey,
      classLabel: t(`srd.class.${classKey}`),
      classDef,
      speciesDef,
      speciesLabel: originNames.name(speciesDef),
      backgroundDef,
      backgroundLabel: originNames.name(backgroundDef),
      feat: originNames.feat(origins, backgroundDef),
      language: originNames.language,
      library: library.features,
      names,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, catalog, origins, classKey, speciesKey, t, names, originNames.language])
  const current = steps[step]!
  const last = step === steps.length - 1
  // Nothing is pre-chosen: the class and the species are the player's own decision.
  const missing = (current === 'class' && !classKey) || (current === 'species' && !speciesKey)
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
        <ClassPicker
          options={quickClasses}
          value={classKey ?? ''}
          onChange={(key) => isClassKey(key) && setClassKey(key)}
          label={t('wizard.class')}
          hideLabel
        />
      )}
      {current === 'class' && (
        <ClassesState loaded={catalog !== null} offered={quickClasses.length} quick />
      )}
      {current === 'species' && (
        <div role="radiogroup" aria-label={t('wizard.species')} className="choice-grid">
          {speciesList.map((def) => (
            <label
              key={def.key}
              className="choice-tile"
              data-checked={speciesKey === def.key || undefined}
            >
              <input
                type="radio"
                name={`${groupId}-species`}
                className="creation-door-input"
                checked={speciesKey === def.key}
                onChange={() => setSpeciesKey(def.key)}
              />
              <span className="choice-tile-name user-copy">{originNames.name(def)}</span>
              <span className="choice-tile-meta">
                {t('creation.speciesLine', {
                  speed: def.speed,
                  traits: def.traits
                    .slice(0, 2)
                    .map((trait) => originNames.name(trait))
                    .join(', '),
                })}
              </span>
              {def.pack && (
                <span className="choice-tile-pack user-copy">
                  {originNames.language.startsWith('en') ? def.pack.title_en : def.pack.title_es}
                </span>
              )}
            </label>
          ))}
        </div>
      )}
      {current === 'species' && (
        <ClassesState loaded={origins !== null} offered={speciesList.length} kind="origins" />
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
              emblem={classEmblem(classKey)}
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
          <CopyArtPrompt
            subject={{
              kind: 'character',
              name: name || characterName,
              traits: [speciesKey, classKey],
            }}
          />
          {draft && (
            <BuildSummary
              draft={draft}
              title={t('creation.prepared')}
              hint={t('creation.preparedHint')}
            />
          )}
        </Stack>
      )}
      {asked && missing && (
        <Alert color="yellow" role="alert" className="wizard-gap-alert">
          {t(current === 'class' ? 'creation.chooseClass' : 'creation.chooseSpecies')}
        </Alert>
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
      {last && <LibraryWait ready={library !== null} onReady={() => finishRef.current?.focus()} />}
      <Group justify="space-between" wrap="nowrap" className="wizard-actions">
        <Button
          variant="default"
          disabled={step === 0 || action.isPending}
          onClick={() => setStep(step - 1)}
        >
          {t('wizard.back')}
        </Button>
        <Button
          ref={finishRef}
          loading={action.isPending}
          disabled={last && (!draft || !name.trim())}
          onClick={() => {
            if (missing) return setAsked(true)
            if (last) return void (draft && create(draft, name).catch(() => undefined))
            setAsked(false)
            setStep(step + 1)
          }}
        >
          {t(last ? 'creation.create' : 'wizard.next')}
        </Button>
      </Group>
    </Stack>
  )
}
