import { useState, type ReactNode } from 'react'
import {
  Button,
  CloseButton,
  RangeSlider,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Group,
} from '@mantine/core'
import { Drawer } from '@/shared/ui/overlays'
import { ArrowDown01, ArrowDownAZ, Search, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Popover } from '@mantine/core'
import { challengeRatings, type CreatureFilters } from '@/features/bestiary'
import { FilterLine } from '@/shared/ui/rail-line'
import { usePhone } from '@/shared/ui/use-viewport'
import { SizeScale, TileGroup, TypeTiles } from './bestiary-widgets'

const crCount = challengeRatings.length - 1
const crAt = (cr: string) => challengeRatings.indexOf(cr as (typeof challengeRatings)[number])
/** Quick CR bands for the filters: what a DM usually reaches for when building a fight. */
const crTiers = [
  { key: 'minion', range: [0, crAt('1')] },
  { key: 'low', range: [crAt('2'), crAt('4')] },
  { key: 'mid', range: [crAt('5'), crAt('10')] },
  { key: 'high', range: [crAt('11'), crAt('16')] },
  { key: 'epic', range: [crAt('17'), crCount] },
] as const satisfies readonly { key: string; range: readonly [number, number] }[]

export function Toolbar({
  packs,
  filters,
  setFilters,
  activeFilters,
  count,
  menu,
  onFirst,
  onEnter,
}: {
  /** RYT-094: the enabled creature packs, each a source to filter by. */
  packs: { id: string; title: string; short: string }[]
  filters: CreatureFilters
  setFilters: (next: CreatureFilters) => void
  activeFilters: number
  count: number
  /** The phone's `···` menu, at the end of the search row. */
  menu?: ReactNode
  onFirst: () => void
  onEnter: () => void
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  const [open, setOpen] = useState(false)
  // Phones, and screens without room below the button (short or with large text), get a sheet
  // (bottom on phones, side otherwise); the dropdown would be a sliver or open off screen.
  const [sheet, setSheet] = useState(phone)
  const toggle = (button: HTMLElement) => {
    if (!open) {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      setSheet(phone || innerHeight - button.getBoundingClientRect().bottom < 16 * rem)
    }
    setOpen(!open)
  }
  const set = (patch: Partial<CreatureFilters>) => setFilters({ ...filters, ...patch })
  const range = filters.crRange ?? [0, crCount]
  // The filters in force as one muted line of words: "Dragón · VD 5–10 · por desafío". Each one is
  // taken off in the Filters sheet; the line's own button clears them all.
  const summary = [
    ...filters.types.map((type) => t(`bestiary.type.${type}`)),
    ...filters.sizes.map((size) => t(`bestiary.size.${size}`)),
    ...(filters.crRange
      ? [
          t('bestiary.filter.crChip', {
            low: challengeRatings[filters.crRange[0]],
            high: challengeRatings[filters.crRange[1]],
          }),
        ]
      : []),
    ...(filters.sort !== 'name' ? [t('bestiary.filter.sortLine')] : []),
  ]
  const panel = (
    <Stack gap="md" className="bst-filters">
      <div>
        <Text size="sm" fw={600} id="bst-filter-cr">
          {t('bestiary.filter.cr', {
            low: challengeRatings[range[0]],
            high: challengeRatings[range[1]],
          })}
        </Text>
        <RangeSlider
          mt={36}
          mb="lg"
          size="lg"
          thumbSize={28}
          min={0}
          max={crCount}
          step={1}
          minRange={0}
          value={range}
          label={(v) => challengeRatings[v]}
          thumbFromLabel={t('bestiary.filter.crMin')}
          thumbToLabel={t('bestiary.filter.crMax')}
          marks={[0, 4, 8, 13, 18, 23, crCount].map((v) => ({
            value: v,
            label: challengeRatings[v],
          }))}
          onChange={(v) => set({ crRange: v[0] === 0 && v[1] === crCount ? null : v })}
        />
        <div className="bst-tiers" role="group" aria-label={t('bestiary.tier.label')}>
          {crTiers.map((tier) => {
            const on = range[0] === tier.range[0] && range[1] === tier.range[1]
            return (
              <button
                key={tier.key}
                type="button"
                className="bst-tier"
                aria-pressed={on}
                onClick={() => set({ crRange: on ? null : [tier.range[0], tier.range[1]] })}
              >
                <span className="bst-tier-name">{t(`bestiary.tier.${tier.key}`)}</span>
                <span className="bst-tier-range">
                  {t('bestiary.tier.range', {
                    low: challengeRatings[tier.range[0]],
                    high: challengeRatings[tier.range[1]],
                  })}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <TypeTiles
        legend={t('bestiary.filter.types')}
        multiple
        value={filters.types}
        onChange={(types) => set({ types })}
      />
      <SizeScale
        legend={t('bestiary.filter.sizes')}
        multiple
        value={filters.sizes}
        onChange={(sizes) => set({ sizes })}
      />
      <TileGroup
        legend={t('bestiary.sort.label')}
        className="bst-choice-tiles"
        value={filters.sort}
        onChange={(sort) => set({ sort })}
        options={[
          {
            value: 'name' as const,
            content: (
              <span className="bst-choice">
                <ArrowDownAZ size={18} aria-hidden="true" />
                <span>
                  <span className="bst-choice-title">{t('bestiary.sort.name')}</span>
                </span>
              </span>
            ),
          },
          {
            value: 'cr' as const,
            content: (
              <span className="bst-choice">
                <ArrowDown01 size={18} aria-hidden="true" />
                <span>
                  <span className="bst-choice-title">{t('bestiary.sort.cr')}</span>
                </span>
              </span>
            ),
          },
        ]}
      />
      <Group justify="space-between" className="bst-filter-actions">
        <Button
          variant="subtle"
          disabled={activeFilters === 0}
          onClick={() => set({ types: [], sizes: [], crRange: null, sort: 'name' })}
        >
          {t('bestiary.filter.clear')}
        </Button>
        <Button onClick={() => setOpen(false)}>{t('bestiary.filter.done', { count })}</Button>
      </Group>
    </Stack>
  )
  const filterButton = (
    <Button
      variant="default"
      data-active={activeFilters > 0 || undefined}
      leftSection={<SlidersHorizontal size={16} aria-hidden="true" />}
      onClick={(event) => toggle(event.currentTarget)}
      aria-haspopup="dialog"
      aria-expanded={open}
      className="bst-filter-button"
    >
      {t('bestiary.filter.button')}
      {activeFilters > 0 && (
        <>
          <span className="bst-filter-count tabular" aria-hidden="true">
            {activeFilters}
          </span>
          <span className="visually-hidden">
            {t('bestiary.filter.active', { count: activeFilters })}
          </span>
        </>
      )}
    </Button>
  )
  return (
    <>
      <div className="bst-toolbar-search">
        <TextInput
          id="bestiary-search"
          className="bst-search"
          type="search"
          label={t('bestiary.search')}
          classNames={{ label: 'visually-hidden' }}
          placeholder={t('bestiary.searchPlaceholder')}
          leftSection={<Search size={18} aria-hidden="true" />}
          value={filters.query}
          onChange={(e) => set({ query: e.currentTarget.value })}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              onFirst()
            } else if (e.key === 'Enter') {
              e.preventDefault()
              onEnter()
            } else if (e.key === 'Escape' && filters.query) {
              e.preventDefault()
              set({ query: '' })
            }
          }}
          rightSectionWidth={48}
          rightSection={
            filters.query ? (
              <CloseButton
                size={44}
                aria-label={t('bestiary.searchClear')}
                onClick={() => {
                  set({ query: '' })
                  document.getElementById('bestiary-search')?.focus()
                }}
              />
            ) : undefined
          }
        />
        <Popover
          opened={open && !sheet}
          onChange={setOpen}
          position="bottom-end"
          width={420}
          trapFocus
          returnFocus
          shadow="md"
          withinPortal
          // The button owns aria-expanded: the filters may open in the sheet instead.
          withRoles={false}
          // Fit the space beside the button and scroll inside: scrolling the page to reach the
          // results button would take the button out of view and hide the dropdown.
          middlewares={{ size: { padding: 8 } }}
        >
          <Popover.Target>{filterButton}</Popover.Target>
          <Popover.Dropdown
            role="dialog"
            aria-label={t('bestiary.filter.title')}
            className="bst-filter-dropdown"
          >
            {panel}
          </Popover.Dropdown>
        </Popover>
        <Drawer
          opened={open && sheet}
          onClose={() => setOpen(false)}
          position={phone ? 'bottom' : 'right'}
          title={t('bestiary.filter.title')}
          closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
          size={phone ? 'auto' : 440}
          zIndex={320}
          classNames={{ content: 'bst-filter-drawer', body: 'bst-filter-sheet' }}
        >
          {panel}
        </Drawer>
        {menu}
      </div>
      <div className="bst-toolbar">
        <div className="bst-toolbar-row">
          {packs.length > 1 ? (
            // Several packs do not fit as segments on a phone: one list names each of them.
            <Select
              className="bst-source-select"
              aria-label={t('bestiary.source.label')}
              value={filters.source}
              onChange={(v) => v && set({ source: v as CreatureFilters['source'] })}
              allowDeselect={false}
              comboboxProps={{ zIndex: 420 }}
              data={[
                { value: 'all', label: t('bestiary.source.all') },
                ...packs.map((pack) => ({ value: `pack:${pack.id}`, label: pack.title })),
                { value: 'homebrew', label: t('bestiary.source.homebrew') },
                { value: 'favorites', label: t('bestiary.source.favorites') },
              ]}
            />
          ) : (
            <SegmentedControl
              className="bst-source ink-seg"
              aria-label={t('bestiary.source.label')}
              value={filters.source}
              onChange={(v) => set({ source: v as CreatureFilters['source'] })}
              data={[
                { value: 'all', label: t('bestiary.source.all') },
                ...packs.map((pack) => ({ value: `pack:${pack.id}`, label: pack.short })),
                { value: 'homebrew', label: t('bestiary.source.homebrew') },
                { value: 'favorites', label: t('bestiary.source.favorites') },
              ]}
            />
          )}
        </div>
        {summary.length > 0 && (
          <FilterLine
            className="bst-filter-line"
            text={summary.join(' · ')}
            clearLabel={t('bestiary.filter.clear')}
            onClear={() => {
              set({ types: [], sizes: [], crRange: null, sort: 'name' })
              // The line goes with its button: focus goes to the Filters button.
              requestAnimationFrame(() =>
                document.querySelector<HTMLElement>('.bst-filter-button')?.focus(),
              )
            }}
          />
        )}
      </div>
    </>
  )
}
