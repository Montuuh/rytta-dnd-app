import { useState } from 'react'
import { Select, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { classDefFor, subclassesFor } from '../../domain/class-catalog'
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
  const { t, i18n } = useTranslation()
  const catalog = useClassCatalog()
  const nameOf = useClassDefName()
  // "Another subclass" is chosen for one class: changing class goes back to the list.
  const [typingFor, setTypingFor] = useState(() =>
    !build.subclassKey && build.subclass ? build.classKey : null,
  )
  const typing = typingFor === build.classKey
  const classDef = classDefFor(catalog, build.classKey)
  const rawSubclasses = subclassesFor(catalog, build.classKey)
  const options = rawSubclasses.map((item) => {
    const base = nameOf(item, 'subclass')
    const packTitle = item.pack
      ? i18n.language.startsWith('en')
        ? item.pack.title_en
        : item.pack.title_es
      : null
    return {
      value: item.key,
      name: base,
      label: packTitle ? `${base} · ${packTitle}` : base,
      caster: item.caster,
      spellAbility: item.spellAbility,
    }
  })
  if (build.subclassKey && !options.some((option) => option.value === build.subclassKey))
    options.push({
      value: build.subclassKey,
      name: build.subclass || build.subclassKey,
      label: build.subclass || build.subclassKey,
      caster: undefined,
      spellAbility: undefined,
    })
  const value = build.subclassKey ? build.subclassKey : typing || build.subclass ? 'custom' : ''
  return (
    <>
      {options.length > 0 && (
        <Select
          label={t('wizard.subclass')}
          data={[
            { value: '', label: t('panel.noSubclass') },
            ...options.map(({ value: itemValue, label }) => ({ value: itemValue, label })),
            { value: 'custom', label: t('panel.otherSubclass') },
          ]}
          value={value}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          onChange={(next) => {
            const option = options.find((item) => item.value === next)
            setTypingFor(next === 'custom' ? build.classKey : null)
            change((draft) => {
              // A subclass gives spellcasting only to a class without it, and leaving that subclass
              // takes back what it gave: a progression the player set by hand stays.
              const baseCaster = classDef?.caster ?? 'none'
              const previous = options.find((item) => item.value === draft.build.subclassKey)
              const gave =
                previous?.caster !== undefined &&
                previous.caster !== 'none' &&
                draft.build.casterKind === previous.caster
              const casterPatch =
                baseCaster !== 'none'
                  ? {}
                  : option?.caster && option.caster !== 'none'
                    ? {
                        casterKind: option.caster,
                        spellAbility: option.spellAbility ?? draft.build.spellAbility ?? 'int',
                      }
                    : gave
                      ? { casterKind: 'none' as const, spellAbility: null }
                      : {}
              return {
                ...draft,
                build: {
                  ...draft.build,
                  subclassKey: option ? option.value : '',
                  subclass: option ? option.name : next === 'custom' ? draft.build.subclass : '',
                  ...casterPatch,
                },
              }
            })
          }}
        />
      )}
      {!build.subclassKey && (options.length === 0 || typing || build.subclass) && (
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
