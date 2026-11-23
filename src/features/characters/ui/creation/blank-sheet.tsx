import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '../sheet/panel.css'
import { Link } from 'react-router'
import { useSrdLibrary } from '@/features/glossary'
import { blankDraft } from '../../domain/quick'
import type { SheetRow } from '../../domain/sheet'
import {
  backgroundDefFor,
  offeredBackgrounds,
  offeredSpecies,
  speciesDefFor,
  type BackgroundDef,
  type SpeciesDef,
} from '../../domain/origin-catalog'
import { classDefFor, offeredClasses } from '../../domain/class-catalog'
import {
  useClassCatalog,
  useClassDefName,
  useOriginCatalog,
  useOriginNames,
} from '../class-catalog'
import { useResourceNames } from '../resource-names'
import { Stepper } from '../sheet/widgets'
import { useCreateSheet } from './use-create-sheet'
import { ClassesState } from './classes-state'
import { LibraryWait } from './library-wait'

/** RYT-072 blank sheet: name, class and level (+ optional species/background); scores at 10. */
const isCustomKey = (key: string) => key === 'custom'

export function BlankSheet({
  sheet,
  name: characterName,
  sheetPath,
}: {
  sheet: SheetRow
  name: string
  sheetPath: string
}) {
  const { t } = useTranslation()
  const library = useSrdLibrary()
  const names = useResourceNames()
  const [name, setName] = useState(characterName)
  const [classKey, setClassKey] = useState<string>('fighter')
  // RYT-168: the classes the campaign offers (SRD and packs).
  const catalog = useClassCatalog()
  const nameOf = useClassDefName()
  const classDef = isCustomKey(classKey) ? null : classDefFor(catalog, classKey)
  const [custom, setCustom] = useState('')
  const [speciesKey, setSpeciesKey] = useState<string>('')
  const [customSpecies, setCustomSpecies] = useState('')
  const [backgroundKey, setBackgroundKey] = useState<string>('')
  const [customBackground, setCustomBackground] = useState('')
  const [level, setLevel] = useState(1)
  // RYT-171: species and backgrounds come from the campaign's packs.
  const origins = useOriginCatalog()
  const originNames = useOriginNames()
  const speciesDef = speciesDefFor(origins, speciesKey)
  const backgroundDef = backgroundDefFor(origins, backgroundKey)
  const option = (def: SpeciesDef | BackgroundDef) => ({
    value: def.key,
    label: def.pack
      ? `${originNames.name(def)} · ${originNames.language.startsWith('en') ? def.pack.title_en : def.pack.title_es}`
      : originNames.name(def),
  })
  const { create, action } = useCreateSheet(sheet, characterName, sheetPath)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const submitRef = useRef<HTMLButtonElement>(null)
  const isCustom = classKey === 'custom'
  const isCustomSpecies = speciesKey === 'custom'
  const isCustomBackground = backgroundKey === 'custom'
  const valid =
    name.trim().length > 0 &&
    (!isCustom || custom.trim().length > 0) &&
    (!isCustomSpecies || customSpecies.trim().length > 0) &&
    (!isCustomBackground || customBackground.trim().length > 0) &&
    library !== null
  return (
    <Stack gap="md" className="creation-wizard blank-sheet">
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
        <Text c="dimmed" className="user-copy">
          {t('creation.blankFor', { name: characterName })}
        </Text>
        <Title order={1} ref={heading} tabIndex={-1}>
          {t('creation.blankTitle')}
        </Title>
        <Text size="sm" c="dimmed" mt={4}>
          {t('creation.blankHint')}
        </Text>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid || !library) return
          void create(
            blankDraft({
              classKey,
              classLabel: isCustom || !classDef ? custom.trim() : nameOf(classDef),
              classDef,
              speciesKey: speciesKey || undefined,
              speciesLabel: isCustomSpecies
                ? customSpecies.trim()
                : speciesDef
                  ? originNames.name(speciesDef)
                  : undefined,
              speciesDef,
              backgroundKey: backgroundKey || undefined,
              backgroundLabel: isCustomBackground
                ? customBackground.trim()
                : backgroundDef
                  ? originNames.name(backgroundDef)
                  : undefined,
              backgroundDef,
              feat: backgroundDef ? originNames.feat(origins, backgroundDef) : null,
              language: originNames.language,
              level,
              library: library.features,
              names,
            }),
            name,
          ).catch(() => undefined)
        }}
      >
        <Stack gap="md" maw={480}>
          <TextInput
            label={t('creation.name')}
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            error={name.trim() ? undefined : t('creation.nameRequired')}
          />
          <Select
            label={t('wizard.class')}
            data={[
              ...(catalog ? offeredClasses(catalog) : []).map((item) => ({
                value: item.key,
                label: nameOf(item),
              })),
              { value: 'custom', label: t('creation.customClass') },
            ]}
            value={classKey}
            allowDeselect={false}
            onChange={(value) => setClassKey(value ?? 'fighter')}
            comboboxProps={{ withinPortal: true }}
          />
          <ClassesState
            loaded={catalog !== null}
            offered={catalog ? offeredClasses(catalog).length : 0}
            wait={false}
          />
          {isCustom && (
            <TextInput
              label={t('wizard.customName')}
              required
              maxLength={60}
              value={custom}
              onChange={(event) => setCustom(event.currentTarget.value)}
            />
          )}
          <Select
            label={t('wizard.species')}
            data={[
              { value: '', label: t('creation.originLater') },
              ...(origins ? offeredSpecies(origins) : []).map(option),
              { value: 'custom', label: t('wizard.customSpecies') },
            ]}
            value={speciesKey}
            allowDeselect={false}
            disabled={origins === null}
            onChange={(value) => setSpeciesKey(value ?? '')}
            comboboxProps={{ withinPortal: true }}
          />
          {isCustomSpecies && (
            <TextInput
              label={t('wizard.customName')}
              required
              maxLength={60}
              value={customSpecies}
              onChange={(event) => setCustomSpecies(event.currentTarget.value)}
            />
          )}
          <Select
            label={t('wizard.background')}
            data={[
              { value: '', label: t('creation.originLater') },
              ...(origins ? offeredBackgrounds(origins) : []).map(option),
              { value: 'custom', label: t('wizard.customBackground') },
            ]}
            value={backgroundKey}
            allowDeselect={false}
            disabled={origins === null}
            onChange={(value) => setBackgroundKey(value ?? '')}
            comboboxProps={{ withinPortal: true }}
          />
          {isCustomBackground && (
            <TextInput
              label={t('wizard.customName')}
              required
              maxLength={60}
              value={customBackground}
              onChange={(event) => setCustomBackground(event.currentTarget.value)}
            />
          )}
          <div>
            <Text size="sm" fw={500} mb={4}>
              {t('wizard.level')}
            </Text>
            <Stepper
              label={t('wizard.level')}
              name={t('panel.levelName')}
              value={level}
              min={1}
              max={20}
              onChange={setLevel}
            />
          </div>
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
          <LibraryWait ready={library !== null} onReady={() => submitRef.current?.focus()} />
          <Group>
            <Button ref={submitRef} type="submit" loading={action.isPending} disabled={!valid}>
              {t('creation.create')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  )
}
