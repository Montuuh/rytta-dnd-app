import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { ActionIcon, Select, Stack, Switch, Tabs, Text, TextInput } from '@mantine/core'
import { Check, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GlossaryTerm, useSrdLibrary } from '@/features/glossary'
import { addLibraryFeature } from '../../domain/progression'
import { isClassKey, slotsFor } from '../../domain/rules'
import { classKeys } from '../../domain/srd'
import type { PanelProps } from './panel-types'
import { BlockSheet } from './widgets'

export type LibraryTab = 'spells' | 'features'
const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()

/** RYT-071: add SRD spells and class features from the glossary, filtered by class and level. */
export function LibraryPicker({
  opened,
  onClose,
  tab,
  onTab,
  props,
  alert,
}: {
  alert?: ReactNode
  opened: boolean
  onClose: () => void
  tab: LibraryTab
  onTab: (tab: LibraryTab) => void
  props: PanelProps
}) {
  const { t } = useTranslation()
  const library = useSrdLibrary()
  const { build, level, change } = props
  const ownClass = isClassKey(build.classKey) ? build.classKey : null
  const [classFilter, setClassFilter] = useState<string>(ownClass ?? '')
  const [anyLevel, setAnyLevel] = useState(false)
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const slots = slotsFor(build.casterKind, level)
  const maxSpellLevel = slots.reduce((top, count, index) => (count > 0 ? index + 1 : top), 0)
  // Already on the sheet: linked entries by id, entries typed by hand by their name.
  const has = useMemo(() => {
    const items = [...build.spells, ...build.features]
    return {
      refs: new Set(items.map((item) => item.ref).filter(Boolean)),
      names: new Set(items.map((item) => plain(item.name))),
    }
  }, [build.spells, build.features])
  const rows = useMemo(() => {
    if (!library) return []
    const needle = plain(deferred.trim())
    const matches = (name: string) => !needle || plain(name).includes(needle)
    if (tab === 'spells')
      return library.spells
        .filter(
          (spell) =>
            matches(spell.name) &&
            (!classFilter || spell.classes.includes(classFilter as never)) &&
            (anyLevel || spell.level <= Math.max(maxSpellLevel, 0)),
        )
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
        .map((spell) => ({
          id: spell.id,
          name: spell.name,
          meta:
            spell.level === 0
              ? t('glossary.spell.cantripShort')
              : t('glossary.spell.levelShort', { level: spell.level }),
          add: () =>
            change(
              (draft) => ({
                ...draft,
                build: {
                  ...draft.build,
                  spells: [
                    ...draft.build.spells,
                    {
                      id: `lib-${spell.id.slice(6)}`.slice(0, 40),
                      ref: spell.id,
                      name: spell.name,
                      level: spell.level,
                      concentration: spell.concentration,
                      ritual: spell.ritual,
                      prepared: false,
                      notes: '',
                    },
                  ].slice(0, 100),
                },
              }),
              'panel.added',
            ),
        }))
    return library.features
      .filter(
        (feature) =>
          matches(feature.name) &&
          (!classFilter || feature.classKey === classFilter) &&
          (anyLevel || feature.level <= level),
      )
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
      .map((feature) => ({
        id: feature.id,
        name: feature.name,
        meta: feature.subclass
          ? `${t('panel.levelShort', { level: feature.level })}, ${t(`srd.subclass.${feature.subclass}`)}`
          : t('panel.levelShort', { level: feature.level }),
        add: () =>
          change(
            (draft) => ({ ...draft, build: addLibraryFeature(draft.build, feature, draft.level) }),
            'panel.added',
          ),
      }))
  }, [library, deferred, tab, classFilter, anyLevel, maxSpellLevel, level, change, t])
  const shown = rows.slice(0, 80)
  return (
    <BlockSheet opened={opened} onClose={onClose} title={t('panel.library')} alert={alert}>
      <Stack gap="sm">
        <Tabs
          className="sheet-tabs"
          value={tab}
          onChange={(value) => onTab((value as LibraryTab) ?? 'spells')}
        >
          <Tabs.List grow aria-label={t('panel.library')}>
            <Tabs.Tab value="spells">{t('glossary.tab.spell')}</Tabs.Tab>
            <Tabs.Tab value="features">{t('glossary.tab.feature')}</Tabs.Tab>
          </Tabs.List>
        </Tabs>
        <TextInput
          label={t('panel.search')}
          leftSection={<Search size={16} aria-hidden="true" />}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <Select
          label={t('glossary.filter.class')}
          data={[
            { value: '', label: t('glossary.feature.allClasses') },
            ...classKeys.map((key) => ({ value: key, label: t(`srd.class.${key}`) })),
          ]}
          value={classFilter}
          allowDeselect={false}
          onChange={(value) => setClassFilter(value ?? '')}
          comboboxProps={{ withinPortal: true }}
        />
        <Switch
          size="md"
          label={tab === 'spells' ? t('panel.anySpellLevel') : t('panel.anyFeatureLevel')}
          checked={anyLevel}
          onChange={(event) => setAnyLevel(event.currentTarget.checked)}
        />
        <Text size="sm" c="dimmed" aria-live="polite">
          {library ? t('panel.libraryCount', { count: rows.length }) : t('glossary.loading')}
        </Text>
        <ul className="library-list">
          {shown.map((row) => {
            const added = has.refs.has(row.id) || has.names.has(plain(row.name))
            return (
              <li key={row.id} className="library-row">
                <div className="feature-main">
                  <Text fw={600}>
                    <GlossaryTerm id={row.id}>{row.name}</GlossaryTerm>
                  </Text>
                  <Text size="sm" c="dimmed">
                    {row.meta}
                  </Text>
                </div>
                <ActionIcon
                  size={44}
                  variant={added ? 'subtle' : 'light'}
                  // aria-disabled keeps focus on the row once it is added.
                  aria-disabled={added || props.pending || undefined}
                  aria-label={
                    added
                      ? t('panel.alreadyAdded', { name: row.name })
                      : t('panel.addNamed', { name: row.name })
                  }
                  onClick={() => !added && !props.pending && row.add()}
                >
                  {added ? (
                    <Check size={18} aria-hidden="true" />
                  ) : (
                    <Plus size={18} aria-hidden="true" />
                  )}
                </ActionIcon>
              </li>
            )
          })}
        </ul>
        {rows.length > shown.length && (
          <Text size="sm" c="dimmed">
            {t('panel.refineSearch', { count: rows.length - shown.length })}
          </Text>
        )}
      </Stack>
    </BlockSheet>
  )
}
