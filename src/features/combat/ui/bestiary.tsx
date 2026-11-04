import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Chip,
  CloseButton,
  Drawer,
  Group,
  Loader,
  Menu,
  Modal,
  NumberInput,
  Popover,
  RangeSlider,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  VisuallyHidden,
} from '@mantine/core'
import {
  Camera,
  Copy,
  CopyPlus,
  EllipsisVertical,
  FilePenLine,
  ImagePlus,
  PawPrint,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  Swords,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import {
  challengeRatings,
  creatureSizes,
  creatureTypes,
  emptyFilters,
  filterCreatures,
  searchKey,
  signed,
  statBlockToText,
  StatBlockView,
  type CreatureFilters,
  type CreatureListItem,
  type CreatureSize,
  type CreatureType,
} from '@/features/bestiary'
import { QueryFeedback } from '@/features/campaigns'
import { usePhone, useWide } from '@/shared/ui/use-viewport'
import { useCreatureImageUpload } from '../api'
import type { CombatantTemplate, TemplateInput } from '../domain/combat'
import { AddToEncounterDialog } from './add-to-encounter'
import { CreatureEditor } from './creature-editor'
import { blankDraft, draftFromBlock, type CreatureDraft } from './creature-draft'
import { templateBlock, useCreatureCatalog } from './creatures'
import { useRunner } from './helpers'
import { NewCreatureDialog } from './new-creature'
import { RunnerError } from './parts'
import { toSquareWebp } from './square-image'
import { Token } from './token'
import './bestiary.css'

const crCount = challengeRatings.length - 1

function useFavorites(campaignId: string) {
  const key = `rytta.bestiary.favorites.${campaignId}`
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown
      return new Set(Array.isArray(stored) ? stored.filter((v) => typeof v === 'string') : [])
    } catch {
      return new Set()
    }
  })
  const toggle = (item: string) =>
    setFavorites((current) => {
      const next = new Set(current)
      if (next.has(item)) next.delete(item)
      else next.add(item)
      try {
        localStorage.setItem(key, JSON.stringify([...next]))
      } catch {
        // Blocked storage keeps favourites for this visit only.
      }
      return next
    })
  return { favorites, toggle }
}

/**
 * The list and stat block sit side by side only when the panel itself has room for both (52rem,
 * so large text needs more): a laptop with the Command Center sidebar or 150% text gets the sheet.
 */
function useSplit(wide: boolean) {
  const ref = useRef<HTMLElement>(null)
  const [roomy, setRoomy] = useState(true)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node || !wide) return
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      setRoomy(node.getBoundingClientRect().width >= 52 * rem)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [wide])
  return { ref, split: wide && roomy }
}

type EditorState = {
  draft: CreatureDraft
  template: CombatantTemplate | null
  unplaced?: string[]
}

/**
 * DM Command Center → Bestiary (ADR 028): the SRD 5.2.1 catalogue and the campaign's own
 * creatures in one searchable list, a full stat block beside it (a full screen sheet on phones),
 * and every way to make a creature: quick, from the SRD, from an archetype or from pasted text.
 * Players never reach this panel; templates are DM-only under RLS.
 */
export function BestiaryPanel({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation()
  const { ref: panelRef, split: wide } = useSplit(useWide())
  const catalog = useCreatureCatalog(campaignId)
  const { favorites, toggle } = useFavorites(campaignId)
  const [params, setParams] = useSearchParams()
  const selectedKey = params.get('creature')
  const [filters, setFilters] = useState<CreatureFilters>(emptyFilters)
  const [adding, setAdding] = useState<CreatureListItem | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [creating, setCreating] = useState(false)
  const [quick, setQuick] = useState<CombatantTemplate | 'new' | null>(null)
  const [deleting, setDeleting] = useState<CombatantTemplate | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const pendingSelect = useRef<string | null>(null)
  const { run, pending, error, trigger, clear } = useRunner(campaignId)
  // Focus returns to the control that opened an overlay, or to the search when it is gone.
  const restore = () => {
    const node = opener.current
    requestAnimationFrame(() =>
      (node?.isConnected ? node : document.getElementById('bestiary-search'))?.focus(),
    )
  }
  // A dialog over the phone sheet owns Escape: the sheet stays open underneath.
  const overlayOpen = Boolean(adding || editor || quick || deleting) || creating
  // "/" jumps to the search from anywhere on the panel, as in the glossary.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
        return
      if (document.querySelector('[role="dialog"]')) return
      const search = document.getElementById('bestiary-search')
      if (!search) return
      event.preventDefault()
      search.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  const results = useMemo(
    () => filterCreatures(catalog.items, filters, favorites, challengeRatings),
    [catalog.items, filters, favorites],
  )
  const selected = catalog.items.find((i) => i.key === selectedKey) ?? null
  const select = (key: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (key) next.set('creature', key)
        else next.delete('creature')
        return next
      },
      { replace: true },
    )
  // A newly saved creature is selected once the list knows it.
  useEffect(() => {
    if (!pendingSelect.current) return
    const latest = [...catalog.templateById.values()]
      .filter((tp) => tp.name === pendingSelect.current)
      .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))[0]
    if (latest) {
      pendingSelect.current = null
      select(`hb:${latest.id}`)
    }
  })
  const noticeAlert = (
    <Alert
      className="combat-alert"
      role="status"
      withCloseButton
      closeButtonLabel={t('action.cancel')}
      onClose={() => setNotice(null)}
      mb="sm"
    >
      {notice}
    </Alert>
  )
  const blockOf = catalog.blockFor
  const templateOf = (item: CreatureListItem | null) =>
    item?.source === 'homebrew' ? (catalog.templateById.get(item.id) ?? null) : null
  const activeFilters =
    filters.types.length +
    filters.sizes.length +
    (filters.crRange ? 1 : 0) +
    (filters.sort !== 'name' ? 1 : 0)
  function draftFromTemplate(template: CombatantTemplate): CreatureDraft {
    const block = templateBlock(template)
    const hints = {
      cr: template.challenge ?? null,
      type: (template.creature_type as CreatureType | undefined) ?? null,
      legendary: template.legendary_max,
      side: template.side,
      srdId: template.srd_id ?? null,
      notes: template.notes,
      name: template.name,
    }
    if (block) {
      const item = catalog.items.find((i) => i.key === `hb:${template.id}`)
      return draftFromBlock(t, catalog.language, block, { ...hints, size: item?.size[0] ?? null })
    }
    // A quick creature grows into a full stat block with its numbers kept.
    const draft = blankDraft(t, catalog.language, template.name)
    return {
      ...draft,
      side: template.side,
      ac: template.armor_class,
      notes: template.notes,
      legendary: template.legendary_max,
      hitDice: Math.max(1, Math.round(template.max_hp / 4.5)),
      initiativeExtra: template.initiative_bonus,
    }
  }
  const detail = selected ? (
    <CreatureDetail
      campaignId={campaignId}
      item={selected}
      catalog={catalog}
      favorite={favorites.has(selected.key)}
      toggleFavorite={() => toggle(selected.key)}
      inSheet={!wide}
      onAdd={(target) => {
        opener.current = target
        setAdding(selected)
      }}
      onCustomise={(target) => {
        opener.current = target
        const block = blockOf(selected)
        const row = catalog.rows.get(selected.id)
        if (!block || !row) return
        setEditor({
          template: null,
          draft: draftFromBlock(t, catalog.language, block, {
            size: row.size[0],
            type: row.type,
            cr: row.cr,
            legendary: row.leg ?? 0,
            srdId: row.id,
          }),
        })
      }}
      onEdit={(target) => {
        opener.current = target
        const template = templateOf(selected)
        if (!template) return
        const block = templateBlock(template)
        if (!block) setQuick(template)
        else setEditor({ template, draft: draftFromTemplate(template) })
      }}
      onComplete={(target) => {
        opener.current = target
        const template = templateOf(selected)
        if (!template) return
        setEditor({ template, draft: draftFromTemplate(template) })
      }}
      onDuplicate={(target) => {
        opener.current = target
        const template = templateOf(selected)
        const block = selected.source === 'srd' ? blockOf(selected) : templateBlock(template)
        if (!block) return
        const base = template
          ? draftFromTemplate(template)
          : draftFromBlock(t, catalog.language, block)
        setEditor({
          template: null,
          draft: {
            ...base,
            name: t('bestiary.duplicateName', { name: selected.name }).slice(0, 80),
          },
        })
      }}
      onDelete={(target) => {
        opener.current = target
        setDeleting(templateOf(selected))
      }}
      onCopied={() => setNotice(t('bestiary.copied', { name: selected.name }))}
    />
  ) : null

  return (
    <section aria-labelledby="bestiary-heading" className="bst" ref={panelRef}>
      <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
        <div>
          <Group gap="xs">
            <PawPrint size={20} className="feature-icon" aria-hidden="true" />
            <Title order={2} id="bestiary-heading">
              {t('bestiary.title')}
            </Title>
          </Group>
          <Text size="sm" c="dimmed" mt={4} maw="62ch" className="bst-intro">
            {t('bestiary.intro')}
          </Text>
        </div>
        <Button
          leftSection={<Plus size={16} aria-hidden="true" />}
          onClick={(event) => {
            opener.current = event.currentTarget
            setCreating(true)
          }}
        >
          {t('bestiary.new')}
        </Button>
      </Group>
      <RunnerError error={error} trigger={trigger} onClose={clear} />
      {/* On phones and tablets an open sheet covers the page: the notice shows inside it. */}
      {notice && (wide || !selected) && noticeAlert}
      <Toolbar
        filters={filters}
        setFilters={setFilters}
        activeFilters={activeFilters}
        count={results.length}
        onFirst={() => document.querySelector<HTMLElement>('.bst-row-main')?.focus()}
        onEnter={() => results[0] && select(results[0].key)}
      />
      <QueryFeedback pending={catalog.pending} error={catalog.error} retry={catalog.retry} />
      {!catalog.pending && (
        <div className={wide ? 'bst-split' : undefined}>
          <CreatureList
            grouping={filters.query.trim() ? null : filters.sort === 'cr' ? 'cr' : 'letter'}
            altLang={catalog.language === 'es' ? 'en' : 'es'}
            items={results}
            selectedKey={selectedKey}
            favorites={favorites}
            toggleFavorite={toggle}
            select={(key, target) => {
              opener.current = target
              select(key)
            }}
            emptyText={
              catalog.items.length === 0
                ? t('bestiary.empty')
                : filters.source === 'favorites' && favorites.size === 0
                  ? t('bestiary.noFavorites')
                  : t('bestiary.noMatch')
            }
            clear={() => {
              setFilters(emptyFilters)
              requestAnimationFrame(() => document.getElementById('bestiary-search')?.focus())
            }}
          />
          {wide && (
            <div className="bst-detail" aria-live="off">
              {detail ?? (
                <div className="bst-detail-empty">
                  <span className="bst-detail-empty-icon" aria-hidden="true">
                    <PawPrint size={28} />
                  </span>
                  <Text fw={600}>{t('bestiary.selectPrompt')}</Text>
                  <Text size="sm" c="dimmed" maw="34ch">
                    {t('bestiary.selectHint')}
                  </Text>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {!wide && (
        <Drawer
          opened={Boolean(selected)}
          onClose={() => {
            select(null)
            restore()
          }}
          position="bottom"
          size="100%"
          title={
            <>
              <span aria-hidden="true">{t('bestiary.title')}</span>
              <VisuallyHidden>{selected?.name}</VisuallyHidden>
            </>
          }
          closeOnEscape={!overlayOpen}
          closeButtonProps={{ 'aria-label': t('bestiary.backToList'), size: 44 }}
          classNames={{ body: 'bst-sheet-body', content: 'bst-sheet' }}
          returnFocus={false}
          transitionProps={{ duration: 180 }}
          lockScroll
          zIndex={300}
        >
          {notice && noticeAlert}
          {detail}
        </Drawer>
      )}
      <footer className="bst-attribution">
        <p>{t('glossary.license')}</p>
        <p>{t('bestiary.adaptation')}</p>
      </footer>
      {creating && (
        <NewCreatureDialog
          language={catalog.language}
          baselines={catalog.baselines}
          srdItems={catalog.items.filter((i) => i.source === 'srd')}
          srdBlock={(id) => catalog.blockFor(catalog.items.find((i) => i.key === `srd:${id}`))}
          onQuick={() => {
            setCreating(false)
            setQuick('new')
          }}
          onDraft={(draft, unplaced) => {
            setCreating(false)
            setEditor({ draft, template: null, unplaced })
          }}
          onClose={() => {
            setCreating(false)
            restore()
          }}
        />
      )}
      {editor && (
        <CreatureEditor
          campaignId={campaignId}
          initial={editor.draft}
          template={editor.template}
          language={catalog.language}
          baselines={catalog.baselines}
          traits={catalog.traits}
          unplaced={editor.unplaced}
          onClose={() => {
            setEditor(null)
            restore()
          }}
          onSaved={(id, name) => {
            setEditor(null)
            setNotice(t('bestiary.saved', { name }))
            if (id) select(`hb:${id}`)
            else pendingSelect.current = name.trim()
            restore()
          }}
        />
      )}
      {quick && (
        <QuickDialog
          template={quick === 'new' ? null : quick}
          pending={pending}
          close={() => {
            setQuick(null)
            restore()
          }}
          save={async (data) => {
            const ok = await run({
              kind: 'saveTemplate',
              templateId: quick === 'new' ? null : quick.id,
              revision: quick === 'new' ? null : quick.revision,
              data,
            })
            if (ok) {
              setQuick(null)
              setNotice(t('bestiary.saved', { name: data.name }))
              if (quick === 'new') pendingSelect.current = data.name
              restore()
            }
          }}
        />
      )}
      {adding && (
        <AddToEncounterDialog
          campaignId={campaignId}
          item={adding}
          block={blockOf(adding)}
          row={adding.source === 'srd' ? catalog.rows.get(adding.id) : undefined}
          template={templateOf(adding) ?? undefined}
          onClose={() => {
            setAdding(null)
            restore()
          }}
        />
      )}
      <Modal
        opened={deleting !== null}
        onClose={() => {
          setDeleting(null)
          restore()
        }}
        title={deleting ? t('combat.bestiary.deleteTitle', { name: deleting.name }) : ''}
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
        zIndex={400}
      >
        <Text>{t('combat.bestiary.deleteBody')}</Text>
        <Group justify="flex-end" mt="md" className="bst-dialog-actions">
          <Button
            variant="subtle"
            data-autofocus
            onClick={() => {
              setDeleting(null)
              restore()
            }}
          >
            {t('action.cancel')}
          </Button>
          <Button
            color="red"
            variant="light"
            loading={pending}
            onClick={async () => {
              if (deleting && (await run({ kind: 'deleteTemplate', templateId: deleting.id }))) {
                const name = deleting.name
                setDeleting(null)
                select(null)
                setNotice(t('bestiary.deleted', { name }))
                requestAnimationFrame(() => document.getElementById('bestiary-search')?.focus())
              }
            }}
          >
            {deleting ? t('combat.bestiary.delete', { name: deleting.name }) : ''}
          </Button>
        </Group>
      </Modal>
    </section>
  )
}

function Toolbar({
  filters,
  setFilters,
  activeFilters,
  count,
  onFirst,
  onEnter,
}: {
  filters: CreatureFilters
  setFilters: (next: CreatureFilters) => void
  activeFilters: number
  count: number
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
  // Removing a chip keeps focus in the summary: the chip that took its place, the one before
  // it when it was the last, or the filters button once the summary is gone.
  const removeFilter = (patch: Partial<CreatureFilters>, index = 0) => {
    set(patch)
    requestAnimationFrame(() => {
      const left = [...document.querySelectorAll<HTMLElement>('.bst-active-chip')]
      ;(
        left[Math.min(index, left.length - 1)] ??
        document.querySelector<HTMLElement>('.bst-filter-button')
      )?.focus()
    })
  }
  const chips: { key: string; label: string; patch: Partial<CreatureFilters> }[] = [
    ...filters.types.map((type) => ({
      key: `type-${type}`,
      label: t(`bestiary.type.${type}`),
      patch: { types: filters.types.filter((x) => x !== type) },
    })),
    ...filters.sizes.map((size) => ({
      key: `size-${size}`,
      label: t(`bestiary.size.${size}`),
      patch: { sizes: filters.sizes.filter((x) => x !== size) },
    })),
    ...(filters.crRange
      ? [
          {
            key: 'cr',
            label: t('bestiary.filter.crChip', {
              low: challengeRatings[filters.crRange[0]],
              high: challengeRatings[filters.crRange[1]],
            }),
            patch: { crRange: null },
          },
        ]
      : []),
    ...(filters.sort !== 'name'
      ? [{ key: 'sort', label: t('bestiary.filter.sortChip'), patch: { sort: 'name' as const } }]
      : []),
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
      </div>
      <div>
        <Text size="sm" fw={600} mb={6} id="bst-filter-type">
          {t('bestiary.filter.types')}
        </Text>
        <Chip.Group
          multiple
          value={filters.types}
          onChange={(v) => set({ types: v as CreatureType[] })}
        >
          <Group gap={6} role="group" aria-labelledby="bst-filter-type">
            {creatureTypes.map((type) => (
              <Chip key={type} value={type} size="sm" className="bst-chip">
                {t(`bestiary.type.${type}`)}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      </div>
      <div>
        <Text size="sm" fw={600} mb={6} id="bst-filter-size">
          {t('bestiary.filter.sizes')}
        </Text>
        <Chip.Group
          multiple
          value={filters.sizes}
          onChange={(v) => set({ sizes: v as CreatureSize[] })}
        >
          <Group gap={6} role="group" aria-labelledby="bst-filter-size">
            {creatureSizes.map((size) => (
              <Chip key={size} value={size} size="sm" className="bst-chip">
                {t(`bestiary.size.${size}`)}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      </div>
      <div>
        <Text size="sm" fw={600} mb={6} id="bst-sort">
          {t('bestiary.sort.label')}
        </Text>
        <SegmentedControl
          fullWidth
          aria-labelledby="bst-sort"
          value={filters.sort}
          onChange={(v) => set({ sort: v as CreatureFilters['sort'] })}
          data={[
            { value: 'name', label: t('bestiary.sort.name') },
            { value: 'cr', label: t('bestiary.sort.cr') },
          ]}
        />
      </div>
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
      variant={activeFilters ? 'light' : 'default'}
      leftSection={<SlidersHorizontal size={16} aria-hidden="true" />}
      onClick={(event) => toggle(event.currentTarget)}
      aria-haspopup="dialog"
      aria-expanded={open}
      className="bst-filter-button"
    >
      {t('bestiary.filter.button')}
      {activeFilters > 0 && (
        <Badge
          size="sm"
          ml={6}
          circle
          aria-label={t('bestiary.filter.active', { count: activeFilters })}
        >
          {activeFilters}
        </Badge>
      )}
    </Button>
  )
  return (
    <div className="bst-toolbar">
      <div className="bst-toolbar-search">
        <TextInput
          id="bestiary-search"
          className="bst-search"
          type="search"
          label={t('bestiary.search')}
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
          rightSection={
            filters.query ? (
              <CloseButton
                size={36}
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
          closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
          size={phone ? 'auto' : 440}
          zIndex={320}
        >
          {panel}
        </Drawer>
      </div>
      <div className="bst-toolbar-row">
        <SegmentedControl
          className="bst-source"
          aria-label={t('bestiary.source.label')}
          value={filters.source}
          onChange={(v) => set({ source: v as CreatureFilters['source'] })}
          data={(['all', 'srd', 'homebrew', 'favorites'] as const).map((value) => ({
            value,
            label: t(`bestiary.source.${value}`),
          }))}
        />
        <p className="bst-count-line" role="status" aria-live="polite">
          {t('bestiary.count', { count })}
        </p>
      </div>
      {chips.length > 0 && (
        <div className="bst-active" role="group" aria-label={t('bestiary.filter.summary')}>
          {chips.map((chip, index) => (
            <button
              key={chip.key}
              type="button"
              className="bst-active-chip"
              aria-label={t('bestiary.filter.remove', { label: chip.label })}
              onClick={() => removeFilter(chip.patch, index)}
            >
              <span>{chip.label}</span>
              <X size={14} strokeWidth={2.5} aria-hidden="true" />
            </button>
          ))}
          {chips.length > 1 && (
            <Button
              variant="subtle"
              className="bst-active-clear"
              onClick={() => removeFilter({ types: [], sizes: [], crRange: null, sort: 'name' })}
            >
              {t('bestiary.filter.clear')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

type Grouping = 'letter' | 'cr' | null

/** Without a query the list reads like an index: letter rules by name, CR rules by challenge. */
function groupsOf(
  items: CreatureListItem[],
  grouping: Grouping,
  noCr: string,
  crLabel: (cr: string) => string,
) {
  if (!grouping) return [{ key: 'all', label: null as string | null, items }]
  const groups: { key: string; label: string | null; items: CreatureListItem[] }[] = []
  for (const item of items) {
    const key =
      grouping === 'cr'
        ? (item.cr ?? '-')
        : /^\p{L}/u.test(searchKey(item.name))
          ? searchKey(item.name)[0]!.toLocaleUpperCase()
          : '#'
    const last = groups[groups.length - 1]
    if (last?.key === key) last.items.push(item)
    else
      groups.push({
        key,
        label: grouping === 'cr' ? (item.cr === null ? noCr : crLabel(item.cr)) : key,
        items: [item],
      })
  }
  return groups
}

function CreatureList({
  items,
  grouping,
  selectedKey,
  favorites,
  toggleFavorite,
  select,
  emptyText,
  clear,
  altLang,
}: {
  altLang: string
  items: CreatureListItem[]
  grouping: Grouping
  selectedKey: string | null
  favorites: ReadonlySet<string>
  toggleFavorite: (key: string) => void
  select: (key: string, target: HTMLElement) => void
  emptyText: string
  clear: () => void
}) {
  const { t } = useTranslation()
  const listId = useId()
  const groups = useMemo(
    () =>
      groupsOf(items, grouping, t('bestiary.group.noCr'), (cr) => t('bestiary.crShort', { cr })),
    [items, grouping, t],
  )
  if (items.length === 0)
    return (
      <div className="bst-empty">
        <span className="bst-detail-empty-icon" aria-hidden="true">
          <Search size={22} />
        </span>
        <Text fw={600}>{emptyText}</Text>
        <Button variant="light" onClick={clear}>
          {t('bestiary.filter.reset')}
        </Button>
      </div>
    )
  // Arrow keys move between rows across groups; Home and End jump to the ends.
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>('.bst-row-main')]
    const at = rows.indexOf(document.activeElement as HTMLElement)
    if (at < 0) return
    event.preventDefault()
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? rows.length - 1
          : Math.max(0, Math.min(rows.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))
    rows[next]?.focus()
  }
  const row = (item: CreatureListItem) => {
    const favorite = favorites.has(item.key)
    const current = item.key === selectedKey
    const alt = item.altName && item.altName !== item.name ? item.altName : null
    return (
      <li key={item.key} className="bst-row" data-current={current || undefined}>
        <button
          type="button"
          className="bst-row-main"
          aria-current={current ? 'true' : undefined}
          onClick={(event) => select(item.key, event.currentTarget)}
        >
          <Token
            name={item.name}
            side={item.side ?? 'enemy'}
            imageKind="creature"
            path={item.imagePath ?? null}
            size={44}
          />
          <span className="bst-row-text">
            <span className="bst-row-name">{item.name}</span>
            {alt && (
              <span className="bst-row-alt" lang={altLang}>
                <span className="visually-hidden"> · </span>
                {alt}
              </span>
            )}
            <span className="bst-row-meta">
              {[
                item.type ? t(`bestiary.type.${item.type}`) : null,
                item.size[0] ? t(`bestiary.size.${item.size[0]}`) : null,
                t('bestiary.rowNumbers', { ac: item.ac, hp: item.hp }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          <span className="bst-row-side">
            {item.cr !== null && (
              <span className="bst-cr">{t('bestiary.crShort', { cr: item.cr })}</span>
            )}
            {item.source === 'homebrew' && (
              <span className="bst-source-badge is-homebrew">{t('bestiary.badge.homebrew')}</span>
            )}
          </span>
        </button>
        <ActionIcon
          variant="subtle"
          size={44}
          className="bst-fav"
          aria-pressed={favorite}
          aria-label={t(favorite ? 'bestiary.favorite.remove' : 'bestiary.favorite.add', {
            name: item.name,
          })}
          onClick={() => toggleFavorite(item.key)}
        >
          <Star size={18} aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} />
        </ActionIcon>
      </li>
    )
  }
  return (
    <div className="bst-list" onKeyDown={onKey}>
      {groups.map((group, index) =>
        group.label === null ? (
          <ul key={group.key} className="bst-items" aria-label={t('bestiary.listLabel')}>
            {group.items.map(row)}
          </ul>
        ) : (
          <div key={group.key} className="bst-group">
            <h3 className="bst-group-head" id={`${listId}-${index}`}>
              <span>{group.label}</span>
              <span className="bst-group-count">
                <span aria-hidden="true">{group.items.length}</span>
                <span className="visually-hidden">
                  {t('bestiary.group.size', { count: group.items.length })}
                </span>
              </span>
            </h3>
            <ul className="bst-items" aria-labelledby={`${listId}-${index}`}>
              {group.items.map(row)}
            </ul>
          </div>
        ),
      )}
    </div>
  )
}

function CreatureDetail({
  campaignId,
  item,
  catalog,
  favorite,
  toggleFavorite,
  inSheet,
  onAdd,
  onCustomise,
  onEdit,
  onComplete,
  onDuplicate,
  onDelete,
  onCopied,
}: {
  campaignId: string
  item: CreatureListItem
  catalog: ReturnType<typeof useCreatureCatalog>
  favorite: boolean
  toggleFavorite: () => void
  inSheet: boolean
  onAdd: (target: HTMLElement) => void
  onCustomise: (target: HTMLElement) => void
  onEdit: (target: HTMLElement) => void
  onComplete: (target: HTMLElement) => void
  onDuplicate: (target: HTMLElement) => void
  onDelete: (target: HTMLElement) => void
  onCopied: () => void
}) {
  const { t } = useTranslation()
  const block = catalog.blockFor(item)
  const template = item.source === 'homebrew' ? catalog.templateById.get(item.id) : undefined
  const row = item.source === 'srd' ? catalog.rows.get(item.id) : undefined
  const headingId = `creature-${item.key.replace(/[^a-z0-9]/gi, '-')}`
  const based = item.srdId ? catalog.srdName(item.srdId) : null
  const badges = (
    <>
      <Badge variant="light" className={`bst-source-badge is-${item.source}`}>
        {t(`bestiary.badge.${item.source}`)}
      </Badge>
      {based && <Badge variant="outline">{t('bestiary.basedOn', { name: based })}</Badge>}
      {item.legendary > 0 && (
        <Badge variant="outline">{t('bestiary.legendaryBadge', { count: item.legendary })}</Badge>
      )}
    </>
  )
  // Menu items unmount with the menu: overlays they open return focus to the ⋯ button.
  const more = useRef<HTMLButtonElement>(null)
  const fromMenu = () => more.current ?? document.body
  const media =
    item.source === 'homebrew' && template ? (
      <CreatureImage campaignId={campaignId} template={template} />
    ) : (
      <Token name={item.name} side="enemy" imageKind="creature" path={null} size={64} />
    )
  const actions = (
    <div className={inSheet ? 'bst-actions is-sticky' : 'bst-actions is-pinned'}>
      <Button
        className="bst-action-primary"
        leftSection={<Swords size={16} aria-hidden="true" />}
        onClick={(e) => onAdd(e.currentTarget)}
      >
        {t('bestiary.addToEncounter')}
      </Button>
      <div className="bst-actions-secondary">
        {item.source === 'srd' ? (
          <Button
            variant="light"
            leftSection={<WandSparkles size={16} aria-hidden="true" />}
            disabled={!block}
            onClick={(e) => onCustomise(e.currentTarget)}
          >
            {t('bestiary.customise')}
          </Button>
        ) : (
          <Button
            variant="light"
            leftSection={<Pencil size={16} aria-hidden="true" />}
            onClick={(e) => onEdit(e.currentTarget)}
          >
            {t('bestiary.edit')}
          </Button>
        )}
        <ActionIcon
          variant="subtle"
          size={44}
          aria-pressed={favorite}
          aria-label={t(favorite ? 'bestiary.favorite.remove' : 'bestiary.favorite.add', {
            name: item.name,
          })}
          onClick={toggleFavorite}
        >
          <Star size={18} aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} />
        </ActionIcon>
        <Menu position="bottom-end" withinPortal zIndex={420}>
          <Menu.Target>
            <ActionIcon
              ref={more}
              variant="subtle"
              size={44}
              aria-label={t('bestiary.more', { name: item.name })}
            >
              <EllipsisVertical size={18} aria-hidden="true" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {item.source === 'homebrew' && !block && (
              <Menu.Item
                leftSection={<FilePenLine size={16} aria-hidden="true" />}
                onClick={() => onComplete(fromMenu())}
              >
                {t('bestiary.complete')}
              </Menu.Item>
            )}
            {block && (
              <Menu.Item
                leftSection={<CopyPlus size={16} aria-hidden="true" />}
                onClick={() => onDuplicate(fromMenu())}
              >
                {t('bestiary.duplicate')}
              </Menu.Item>
            )}
            {block && (
              <Menu.Item
                leftSection={<Copy size={16} aria-hidden="true" />}
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(statBlockToText(block, catalog.language))
                    .then(onCopied, () => undefined)
                }}
              >
                {t('bestiary.copyText')}
              </Menu.Item>
            )}
            {item.source === 'homebrew' && (
              <Menu.Item
                color="red"
                leftSection={<Trash2 size={16} aria-hidden="true" />}
                onClick={() => onDelete(fromMenu())}
              >
                {t('bestiary.delete')}
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </div>
    </div>
  )
  if (!block) {
    if (item.source === 'srd' && catalog.bodiesPending)
      return (
        <Group gap="sm" p="md" role="status">
          <Loader size="sm" />
          <Text>{t('bestiary.loading')}</Text>
        </Group>
      )
    // A quick creature: the core numbers only.
    return (
      <Stack gap="md" className="bst-detail-inner">
        <header className="sb-head">
          {media}
          <div className="sb-title">
            <Title order={inSheet ? 2 : 3} id={headingId} className="sb-name">
              {item.name}
            </Title>
            <div className="sb-badges">{badges}</div>
          </div>
        </header>
        {/* First in the tab order; on phones it sticks to the bottom of the sheet (CSS order). */}
        {actions}
        <dl className="sb-core">
          <div>
            <dt>{t('bestiary.ac')}</dt>
            <dd>{item.ac}</dd>
          </div>
          <div>
            <dt>{t('bestiary.hp')}</dt>
            <dd>{item.hp}</dd>
          </div>
          <div>
            <dt>{t('bestiary.initiative')}</dt>
            <dd>{signed(item.initiative)}</dd>
          </div>
        </dl>
        {template?.notes && <Text className="combat-notes">{template.notes}</Text>}
        <Alert variant="light" role="note" icon={<FilePenLine size={18} aria-hidden="true" />}>
          <Text size="sm">{t('bestiary.quickHint')}</Text>
          <Button mt="xs" variant="light" onClick={(e) => onComplete(e.currentTarget)}>
            {t('bestiary.complete')}
          </Button>
        </Alert>
      </Stack>
    )
  }
  return (
    <Stack gap="md" className="bst-detail-inner">
      {actions}
      <StatBlockView
        block={block}
        level={inSheet ? 2 : 3}
        headingId={headingId}
        media={media}
        badges={badges}
        footnote={
          row
            ? t('bestiary.srdPage', { page: row.pages[catalog.language] })
            : template?.notes
              ? t('bestiary.notesLine', { notes: template.notes })
              : undefined
        }
      />
    </Stack>
  )
}

/**
 * The creature's token is its own upload control (RYT-043): tapping it (or Enter/Space on its focus)
 * opens the file picker; a camera seal on the rim says so. The image is cropped to a 512px WebP square,
 * stored privately and attached with the template's revision. Progress, success and failure are
 * announced; a failure stays next to the token until the next attempt.
 */
function CreatureImage({
  campaignId,
  template,
}: {
  campaignId: string
  template: CombatantTemplate
}) {
  const { t } = useTranslation()
  const inputId = useId()
  const errorId = useId()
  const upload = useCreatureImageUpload(campaignId)
  const [unreadable, setUnreadable] = useState(false)
  const [done, setDone] = useState(false)
  const failed = unreadable || upload.isError
  const has = Boolean(template.image_path)
  const action = t(has ? 'combat.image.change' : 'combat.image.add', { name: template.name })
  return (
    <div className="combat-creature-image">
      <input
        id={inputId}
        type="file"
        accept="image/webp,image/png,image/jpeg"
        className="visually-hidden combat-image-input"
        disabled={upload.isPending}
        // One accessible name, on the control itself (RYT-043 F5); the label is the visual target.
        aria-label={action}
        aria-describedby={failed ? errorId : undefined}
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!file) return
          setUnreadable(false)
          setDone(false)
          upload.reset()
          let image: Blob
          try {
            image = await toSquareWebp(file)
          } catch {
            setUnreadable(true)
            return
          }
          upload.mutate(
            { templateId: template.id, revision: template.revision, image },
            { onSuccess: () => setDone(true) },
          )
        }}
      />
      <label
        htmlFor={inputId}
        className="combat-image-picker"
        data-pending={upload.isPending || undefined}
        title={action}
      >
        <Token
          name={template.name}
          side={template.side}
          imageKind="creature"
          path={template.image_path}
          size={64}
        >
          <span className="combat-image-seal" aria-hidden="true">
            {upload.isPending ? (
              <Loader size={14} color="currentColor" />
            ) : has ? (
              <Camera size={16} strokeWidth={2.25} />
            ) : (
              <ImagePlus size={16} strokeWidth={2.25} />
            )}
          </span>
        </Token>
      </label>
      <VisuallyHidden role="status">
        {upload.isPending
          ? t('combat.image.saving')
          : done
            ? t('combat.image.saved', { name: template.name })
            : ''}
      </VisuallyHidden>
      {failed && (
        <Text id={errorId} role="alert" size="sm" className="combat-image-error">
          {t(unreadable ? 'combat.image.unreadable' : 'combat.image.failed')}
        </Text>
      )}
    </div>
  )
}

/** Quick creature: the numbers combat needs, nothing more (the RYT-036 dialog). */
function QuickDialog({
  template,
  pending,
  close,
  save,
}: {
  template: CombatantTemplate | null
  pending: boolean
  close: () => void
  save: (data: TemplateInput) => void
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  const [name, setName] = useState(template?.name ?? '')
  const [side, setSide] = useState<'enemy' | 'ally'>(template?.side ?? 'enemy')
  const [maxHp, setMaxHp] = useState<number | string>(template?.max_hp ?? 7)
  const [ac, setAc] = useState<number | string>(template?.armor_class ?? 12)
  const [bonus, setBonus] = useState<number | string>(template?.initiative_bonus ?? 0)
  const [legendary, setLegendary] = useState<number | string>(template?.legendary_max ?? 0)
  const [notes, setNotes] = useState(template?.notes ?? '')
  const valid =
    name.trim().length > 0 && [maxHp, ac, bonus, legendary].every((n) => typeof n === 'number')
  return (
    <Modal
      opened
      onClose={close}
      fullScreen={phone}
      zIndex={400}
      title={
        template ? t('combat.bestiary.edit', { name: template.name }) : t('bestiary.start.quick')
      }
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid || pending) return
          save({
            name: name.trim(),
            side,
            max_hp: maxHp as number,
            armor_class: ac as number,
            initiative_bonus: bonus as number,
            legendary_max: legendary as number,
            notes,
          })
        }}
      >
        <Stack gap="sm">
          <TextInput
            data-autofocus
            required
            label={t('combat.add.name')}
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <div>
            <Text size="sm" fw={500} mb={4} id="template-side">
              {t('combat.add.side')}
            </Text>
            <SegmentedControl
              fullWidth
              aria-labelledby="template-side"
              value={side}
              onChange={(value) => setSide(value as 'enemy' | 'ally')}
              data={[
                { value: 'enemy', label: t('combat.side.enemy') },
                { value: 'ally', label: t('combat.side.ally') },
              ]}
            />
          </div>
          <div className="combat-grid-2">
            <NumberInput
              hideControls
              label={t('combat.add.maxHp')}
              min={1}
              max={99999}
              allowDecimal={false}
              value={maxHp}
              onChange={setMaxHp}
            />
            <NumberInput
              hideControls
              label={t('combat.add.ac')}
              min={0}
              max={99}
              allowDecimal={false}
              value={ac}
              onChange={setAc}
            />
            <NumberInput
              hideControls
              label={t('combat.add.bonus')}
              min={-20}
              max={30}
              allowDecimal={false}
              value={bonus}
              onChange={setBonus}
            />
            <NumberInput
              hideControls
              label={t('combat.add.legendary')}
              min={0}
              max={9}
              allowDecimal={false}
              value={legendary}
              onChange={setLegendary}
            />
          </div>
          <Textarea
            label={t('combat.bestiary.notes')}
            value={notes}
            maxLength={2000}
            autosize
            minRows={3}
            onChange={(event) => setNotes(event.currentTarget.value)}
          />
          <Group justify="flex-end" className="bst-dialog-actions">
            <Button variant="subtle" onClick={close}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={!valid || pending} loading={pending}>
              {t('combat.bestiary.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
