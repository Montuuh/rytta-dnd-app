import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '../sheet/panel.css'
import { Link } from 'react-router'
import { useSrdLibrary } from '@/features/glossary'
import { blankDraft } from '../../domain/quick'
import type { SheetRow } from '../../domain/sheet'
import { backgroundKeys, classKeys, speciesKeys } from '../../domain/srd'
import { Stepper } from '../sheet/widgets'
import { useCreateSheet } from './use-create-sheet'

/** RYT-072 blank sheet: name, class and level (+ optional species/background); scores at 10. */
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
  const [name, setName] = useState(characterName)
  const [classKey, setClassKey] = useState<string>('fighter')
  const [custom, setCustom] = useState('')
  const [speciesKey, setSpeciesKey] = useState<string>('')
  const [customSpecies, setCustomSpecies] = useState('')
  const [backgroundKey, setBackgroundKey] = useState<string>('')
  const [customBackground, setCustomBackground] = useState('')
  const [level, setLevel] = useState(1)
  const { create, action } = useCreateSheet(sheet, characterName, sheetPath)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
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
              classLabel: isCustom ? custom.trim() : t(`srd.class.${classKey as 'monk'}`),
              speciesKey: speciesKey || undefined,
              speciesLabel: isCustomSpecies
                ? customSpecies.trim()
                : speciesKey
                  ? t(`srd.species.${speciesKey as 'human'}`)
                  : undefined,
              backgroundKey: backgroundKey || undefined,
              backgroundLabel: isCustomBackground
                ? customBackground.trim()
                : backgroundKey
                  ? t(`srd.background.${backgroundKey as 'acolyte'}`)
                  : undefined,
              name: (kind, key) => t(`srd.${kind}.${key}` as 'srd.trait.darkvision'),
              level,
              library: library.features,
              names: {
                resource: (key) => t(`panel.resource.${key}` as 'panel.resource.monk-focus'),
              },
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
              ...classKeys.map((key) => ({ value: key, label: t(`srd.class.${key}`) })),
              { value: 'custom', label: t('creation.customClass') },
            ]}
            value={classKey}
            allowDeselect={false}
            onChange={(value) => setClassKey(value ?? 'fighter')}
            comboboxProps={{ withinPortal: true }}
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
              ...speciesKeys.map((key) => ({ value: key, label: t(`srd.species.${key}`) })),
              { value: 'custom', label: t('wizard.customSpecies') },
            ]}
            value={speciesKey}
            allowDeselect={false}
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
              ...backgroundKeys.map((key) => ({
                value: key,
                label: t(`srd.background.${key}`),
              })),
              { value: 'custom', label: t('wizard.customBackground') },
            ]}
            value={backgroundKey}
            allowDeselect={false}
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
          <Group>
            <Button type="submit" loading={action.isPending} disabled={!valid}>
              {t('creation.create')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  )
}
