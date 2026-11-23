import { Select, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { subclassesFor } from '../../domain/class-catalog'
import type { Build, SheetDraft } from '../../domain/sheet'
import { useClassCatalog, useClassDefName } from '../class-catalog'

/**
 * RYT-168: the subclass of the sheet, chosen among the subclasses of its class the campaign
 * offers (SRD or packs) or typed by hand. A subclass no longer offered stays as it is.
 */
export function SubclassFields({
  build,
  change,
}: {
  build: Build
  change: (update: (draft: SheetDraft) => SheetDraft) => void
}) {
  const { t } = useTranslation()
  const catalog = useClassCatalog()
  const nameOf = useClassDefName()
  const options = subclassesFor(catalog, build.classKey).map((item) => ({
    value: item.key,
    label: nameOf(item, 'subclass'),
  }))
  if (build.subclassKey && !options.some((option) => option.value === build.subclassKey))
    options.push({ value: build.subclassKey, label: build.subclass || build.subclassKey })
  const value = build.subclassKey ? build.subclassKey : build.subclass ? 'custom' : ''
  return (
    <>
      {options.length > 0 && (
        <Select
          label={t('wizard.subclass')}
          data={[
            { value: '', label: t('panel.noSubclass') },
            ...options,
            { value: 'custom', label: t('panel.otherSubclass') },
          ]}
          value={value}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          onChange={(next) => {
            const option = options.find((item) => item.value === next)
            change((draft) => ({
              ...draft,
              build: {
                ...draft.build,
                subclassKey: option ? option.value : '',
                subclass: option ? option.label : next === 'custom' ? draft.build.subclass : '',
              },
            }))
          }}
        />
      )}
      {!build.subclassKey && (options.length === 0 || build.subclass) && (
        <TextInput
          label={t('panel.subclassName')}
          maxLength={60}
          value={build.subclass}
          onChange={(event) => {
            const subclass = event.currentTarget.value
            change((draft) => ({ ...draft, build: { ...draft.build, subclass } }))
          }}
        />
      )}
    </>
  )
}
