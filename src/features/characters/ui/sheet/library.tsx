import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { ActionIcon, Button, Select, Stack, Switch, Tabs, Text, TextInput } from '@mantine/core'
import { Check, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GlossaryTerm, useClassName, useSrdLibrary } from '@/features/glossary'
import { addLibraryFeature } from '../../domain/progression'
import { slotsFor } from '../../domain/rules'
import {
  useClassCatalog,
  useClassDefName,
  useOriginCatalog,
  useOriginNames,
} from '../class-catalog'
import { featRef } from '../../domain/origin-catalog'
import type { PanelProps } from './panel-types'
import { BlockSheet } from './widgets'

export type LibraryTab = 'spells' | 'features' | 'feats'
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
  props: Pick<PanelProps, 'build' | 'level' | 'change' | 'pending'>
}) {
  const { t, i18n } = useTranslation()
  const library = useSrdLibrary()
  const catalog = useClassCatalog()
  const origins = useOriginCatalog()
  const originNames = useOriginNames()
  const className = useClassName()
  const defName = useClassDefName()
  const { build, level, change } = props
  // RYT-168: any class the campaign has (SRD or pack) filters by default.
  const ownClass = catalog?.classes.some((item) => item.key === build.classKey)
    ? build.classKey
    : null
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
            (!classFilter || spell.classes.includes(classFilter)) &&
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
    if (tab === 'feats') {
      const feats = origins?.feats ?? []
      return feats
        .filter((feat) => {
          const name = originNames.name(feat)
          return (
            !feat.hidden &&
            feat.key !== 'ability-score-improvement' &&
            matches(name) &&
            (anyLevel || (feat.level ?? 1) <= level)
          )
        })
        .sort((a, b) => originNames.name(a).localeCompare(originNames.name(b)))
        .map((feat) => {
          const name = originNames.name(feat)
          const ref = featRef(feat.key)
          const packTitle = feat.pack
            ? i18n.language.startsWith('en')
              ? feat.pack.title_en
              : feat.pack.title_es
            : null
          const parts = [
            feat.level ? t('panel.levelShort', { level: feat.level }) : null,
            packTitle,
          ].filter(Boolean)
          return {
            id: ref,
            name,
            meta: parts.join(' · '),
            add: () =>
              change(
                (draft) => ({
                  ...draft,
                  build: {
                    ...draft.build,
                    features: [
                      ...draft.build.features,
                      {
                        id: `lib-feat-${feat.key}`.slice(0, 90),
                        name,
                        source: 'feat' as const,
                        description: '',
                        ref,
                        level: draft.level,
                      },
                    ].slice(0, 120),
                  },
                }),
                'panel.added',
              ),
          }
        })
    }
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
          ? `${t('panel.levelShort', { level: feature.level })}, ${className('subclass', feature.subclass)}`
          : t('panel.levelShort', { level: feature.level }),
        add: () =>
          change(
            (draft) => ({ ...draft, build: addLibraryFeature(draft.build, feature, draft.level) }),
            'panel.added',
          ),
      }))
  }, [
    library,
    origins,
    originNames,
    i18n.language,
    deferred,
    tab,
    classFilter,
    anyLevel,
    maxSpellLevel,
    level,
    change,
    t,
    className,
  ])
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
            <Tabs.Tab value="feats">{t('library.kind.feat')}</Tabs.Tab>
          </Tabs.List>
        </Tabs>
        <TextInput
          label={t('panel.search')}
          leftSection={<Search size={16} aria-hidden="true" />}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        {tab !== 'feats' && (
          <Select
            label={t('glossary.filter.class')}
            data={[
              { value: '', label: t('glossary.feature.allClasses') },
              ...(catalog?.classes ?? []).map((item) => ({
                value: item.key,
                label: defName(item),
              })),
            ]}
            value={classFilter}
            allowDeselect={false}
            onChange={(value) => setClassFilter(value ?? '')}
            comboboxProps={{ withinPortal: true }}
          />
        )}
        <Switch
          size="md"
          label={
            tab === 'spells'
              ? t('panel.anySpellLevel')
              : tab === 'feats'
                ? t('panel.anyFeatLevel')
                : t('panel.anyFeatureLevel')
          }
          checked={anyLevel}
          onChange={(event) => setAnyLevel(event.currentTarget.checked)}
        />
        <Text size="sm" c="dimmed" aria-live="polite">
          {library && (tab !== 'feats' || origins)
            ? t('panel.libraryCount', { count: rows.length })
            : t('glossary.loading')}
        </Text>
        {library && rows.length === 0 && classFilter && tab !== 'feats' && (
          <div className="library-empty" role="status">
            <Text size="sm">
              {t('panel.libraryNoneInClass', { class: t(`srd.class.${classFilter as 'bard'}`) })}
            </Text>
            <Button variant="light" onClick={() => setClassFilter('')}>
              {t('panel.libraryAllClasses')}
            </Button>
          </div>
        )}
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
