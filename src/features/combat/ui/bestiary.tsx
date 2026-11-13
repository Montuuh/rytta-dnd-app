import {
  useDeferredValue,
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
  CloseButton,
  Drawer,
  Group,
  Loader,
  Menu,
  Modal,
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
  ArrowDown01,
  ArrowDownAZ,
  BookMinus,
  Bookmark,
  Check,
  Crown,
  Heart,
  Shield,
  Zap,
  Copy,
  CopyPlus,
  EllipsisVertical,
  FilePenLine,
  PawPrint,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Swords,
  Trash2,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import {
  challengeRatings,
  emptyFilters,
  filterCreatures,
  searchKey,
  signed,
  statBlockToText,
  StatBlockView,
  type CreatureFilters,
  type CreatureListItem,
  type CreatureType,
} from '@/features/bestiary'
import { QueryFeedback } from '@/features/campaigns'
import { usePhone, useWide } from '@/shared/ui/use-viewport'
import type { CombatantTemplate, TemplateInput } from '../domain/combat'
import { AddToEncounterDialog } from './add-to-encounter'
import { CreatureEditor } from './creature-editor'
import { blankDraft, draftFromBlock, type CreatureDraft } from './creature-draft'
import { CreatureArtControl, type ArtNotice } from './creature-art'
import { itemArt, templateBlock, useCreatureCatalog } from './creatures'
import { useRunner } from './helpers'
import { NewCreatureDialog } from './new-creature'
import {
  OfficialDialog,
  OfficialMenu,
  OfficialMissing,
  VersionNote,
  type OfficialAsk,
} from './official-bestiary'
import { RunnerError } from './parts'
import { typeGlyphs } from './bestiary-glyphs'
import { NumberDial, SideToggle, SizeScale, TileGroup, TypeTiles } from './bestiary-widgets'
import { Token } from './token'
import './bestiary.css'

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
  /** The SRD creature a customised copy starts from (shown in the editor title). */
  basedOn?: string
  /** RYT-089: a new campaign version of that official creature (edited in place). */
  version?: boolean
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
  const [asking, setAsking] = useState<OfficialAsk | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const pendingSelect = useRef<string | null>(null)
  // After going back to the official creature, focus waits for its stat block's Edit button.
  const focusEdit = useRef<string | null>(null)
  const { run, pending, error, trigger, clear } = useRunner(campaignId)
  // Focus returns to the control that opened an overlay, or to the search when it is gone.
  const restore = () => {
    const node = opener.current
    requestAnimationFrame(() =>
      (node?.isConnected ? node : document.getElementById('bestiary-search'))?.focus(),
    )
  }
  // A dialog over the phone sheet owns Escape: the sheet stays open underneath.
  const [viewingArt, setViewingArt] = useState(false)
  const overlayOpen =
    Boolean(adding || editor || quick || deleting || asking) || creating || viewingArt
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
  // The list follows the query a frame behind the field, so typing never waits for 330 rows.
  const deferredQuery = useDeferredValue(filters.query)
  const results = useMemo(
    () =>
      filterCreatures(
        catalog.items,
        { ...filters, query: deferredQuery },
        favorites,
        challengeRatings,
      ),
    [catalog.items, filters, deferredQuery, favorites],
  )
  // RYT-089: an official creature that gets a campaign version stays open as that version.
  const selected =
    catalog.items.find((i) => i.key === selectedKey) ??
    (selectedKey?.startsWith('srd:')
      ? catalog.items.find((i) => i.version && `srd:${i.srdId}` === selectedKey)
      : undefined) ??
    null
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
  useEffect(() => {
    if (!focusEdit.current || selected?.key !== focusEdit.current) return
    focusEdit.current = null
    // A frame later, once the phone sheet has taken focus back from the closed dialog.
    requestAnimationFrame(() =>
      [...document.querySelectorAll<HTMLElement>('[data-bst-edit]')]
        .find((node) => node.getClientRects().length > 0)
        ?.focus(),
    )
  })
  const noticeAlert = (
    <Alert
      className="combat-alert"
      role="status"
      withCloseButton
      closeButtonLabel={t('common.close')}
      onClose={() => setNotice(null)}
      mb="sm"
    >
      {notice}
    </Alert>
  )
  const blockOf = catalog.blockFor
  // RYT-089: the campaign's official bestiary and its versions of official creatures.
  const official = catalog.official
  const versions = [...catalog.templateById.values()].filter((tp) => tp.srd_override).length
  // Neither creatures nor the official bestiary yet: the download is the page's one primary action.
  const empty = !catalog.pending && catalog.items.length === 0 && official?.downloaded === false
  const ask = (next: OfficialAsk, target: HTMLElement) => {
    opener.current = target
    setAsking(next)
  }
  const confirmOfficial = async (next: OfficialAsk) => {
    const srdOf = (item: CreatureListItem) => (item.source === 'srd' ? item.id : item.srdId!)
    // Going back to the official creature: its key already shows the version, so the open stat
    // block never closes in between (and keeps its focus) when the version is deleted.
    const officialKey =
      next.kind === 'restore' && next.template.srd_id ? `srd:${next.template.srd_id}` : null
    if (officialKey) select(officialKey)
    const ok =
      next.kind === 'restore'
        ? await run({ kind: 'deleteTemplate', templateId: next.template.id })
        : next.kind === 'remove'
          ? await run({ kind: 'srdBestiary', action: 'remove', srdId: srdOf(next.item) })
          : await run({
              kind: 'srdBestiary',
              action: next.kind === 'download' ? 'download' : 'removeAll',
            })
    if (!ok) return
    setAsking(null)
    if (next.kind === 'download')
      setNotice(
        official && official.removed.length > 0
          ? t('bestiary.official.broughtBack', { count: official.removed.length })
          : t('bestiary.official.downloaded', { count: catalog.officialCount }),
      )
    else if (next.kind === 'removeAll') {
      if (selected?.source === 'srd' || selected?.version) select(null)
      setNotice(t('bestiary.official.removedAll'))
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>('.bst-official-empty button, .bst-official-line button')
          ?.focus(),
      )
      return
    } else if (next.kind === 'remove') {
      select(null)
      setNotice(t('bestiary.official.removed', { name: next.item.name }))
    } else {
      setNotice(t('bestiary.official.restored', { name: next.template.name }))
      if (officialKey) {
        focusEdit.current = officialKey
        return
      }
      select(null)
    }
    restore()
  }
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
      onViewArt={setViewingArt}
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
          basedOn: selected.name,
          version: true,
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
      onRemove={(target) => ask({ kind: 'remove', item: selected }, target)}
      onRestore={(target) => {
        const template = templateOf(selected)
        if (template) ask({ kind: 'restore', template }, target)
      }}
      onCopied={() => setNotice(t('bestiary.copied', { name: selected.name }))}
    />
  ) : null

  return (
    <section
      aria-labelledby="bestiary-heading"
      className="bst"
      ref={panelRef}
      data-split={wide || undefined}
    >
      <div className="bst-head">
        <div className="bst-head-title">
          <Group gap="xs" wrap="nowrap">
            <PawPrint size={20} className="feature-icon" aria-hidden="true" />
            <Title order={2} id="bestiary-heading">
              {t('bestiary.title')}
            </Title>
          </Group>
          <Text size="sm" c="dimmed" mt={4} maw="62ch" className="bst-intro">
            {t('bestiary.intro')}
          </Text>
        </div>
        <div className="bst-head-actions">
          <Button
            variant={empty ? 'light' : 'filled'}
            leftSection={<Plus size={16} aria-hidden="true" />}
            onClick={(event) => {
              opener.current = event.currentTarget
              setCreating(true)
            }}
          >
            {t('bestiary.new')}
          </Button>
          {official?.downloaded && <OfficialMenu state={official} onAsk={ask} />}
        </div>
      </div>
      <RunnerError error={error} trigger={trigger} onClose={clear} />
      {/* On phones and tablets an open sheet covers the page: the notice shows inside it. */}
      {notice && (wide || !selected) && noticeAlert}
      {/* RYT-089: nothing to search before the campaign has a creature or the official bestiary. */}
      {(catalog.pending || catalog.items.length > 0 || official?.downloaded) && (
        <Toolbar
          official={Boolean(official?.downloaded)}
          filters={filters}
          setFilters={setFilters}
          activeFilters={activeFilters}
          count={results.length}
          onFirst={() => document.querySelector<HTMLElement>('.bst-row-main')?.focus()}
          onEnter={() => results[0] && select(results[0].key)}
        />
      )}
      <QueryFeedback pending={catalog.pending} error={catalog.error} retry={catalog.retry} />
      {!catalog.pending && official && !official.downloaded && (
        <OfficialMissing
          count={catalog.officialCount}
          compact={catalog.items.length > 0}
          onDownload={(target) => ask({ kind: 'download' }, target)}
        />
      )}
      {!catalog.pending && (catalog.items.length > 0 || official?.downloaded) && (
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
          basedOn={editor.basedOn}
          version={editor.version}
          onClose={() => {
            setEditor(null)
            restore()
          }}
          onSaved={(id, name) => {
            setEditor(null)
            setNotice(
              t(editor.version ? 'bestiary.official.versionSaved' : 'bestiary.saved', { name }),
            )
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
      <OfficialDialog
        ask={asking}
        count={catalog.officialCount}
        removed={official?.removed.length ?? 0}
        versions={versions}
        pending={pending}
        onConfirm={(next) => void confirmOfficial(next)}
        onClose={() => {
          setAsking(null)
          restore()
        }}
      />
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
  official,
  filters,
  setFilters,
  activeFilters,
  count,
  onFirst,
  onEnter,
}: {
  /** RYT-089: the campaign has the official bestiary (its tab is shown). */
  official: boolean
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
                <span className="bst-tier-name">
                  <Check size={12} strokeWidth={3} className="bst-tier-check" aria-hidden="true" />
                  {t(`bestiary.tier.${tier.key}`)}
                </span>
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
                  <span className="bst-choice-help">{t('bestiary.sort.nameHelp')}</span>
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
                  <span className="bst-choice-help">{t('bestiary.sort.crHelp')}</span>
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
    <>
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
          closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
          size={phone ? 'auto' : 440}
          zIndex={320}
          classNames={{ content: 'bst-filter-drawer', body: 'bst-filter-sheet' }}
        >
          {panel}
        </Drawer>
      </div>
      <div className="bst-toolbar">
        <div className="bst-toolbar-row">
          <SegmentedControl
            className="bst-source"
            aria-label={t('bestiary.source.label')}
            value={filters.source}
            onChange={(v) => set({ source: v as CreatureFilters['source'] })}
            data={(['all', 'srd', 'homebrew', 'favorites'] as const)
              .filter((value) => official || value !== 'srd')
              .map((value) => ({ value, label: t(`bestiary.source.${value}`) }))}
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
    </>
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
            art={itemArt(item)?.thumb}
            size={44}
            glyph={item.type ? typeGlyphs[item.type] : undefined}
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
            {item.version ? (
              <span className="bst-source-badge is-version">{t('bestiary.badge.version')}</span>
            ) : (
              item.source === 'homebrew' && (
                <span className="bst-source-badge is-homebrew">{t('bestiary.badge.homebrew')}</span>
              )
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
          <Bookmark size={18} aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} />
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

/**
 * RYT-091: in a sheet, the stat column beside the reading stays in view only when all of it fits
 * between the sheet's header and its action bar. Its CSS sizes the plate for the usual case; a notice
 * under the plate or a long speed can still make it taller, and then it scrolls with the page instead
 * of hiding its end under the bar.
 */
function useColumnFit(frame: { current: HTMLDivElement | null }, creature: string) {
  useEffect(() => {
    const node = frame.current
    const sheet = node?.closest<HTMLElement>('.bst-sheet')
    const aside = node?.querySelector<HTMLElement>('.sb-aside')
    if (!sheet || !aside) return
    const check = () => {
      const head =
        sheet.querySelector('.mantine-Drawer-header')?.getBoundingClientRect().height ?? 0
      const bar = sheet.querySelector('.bst-actions')?.getBoundingClientRect().height ?? 0
      // 12px of air under the header and above the bar.
      aside.toggleAttribute(
        'data-unstuck',
        aside.offsetHeight > sheet.clientHeight - head - bar - 24,
      )
    }
    // The sheet's height and the column's own (a notice under the plate) both decide.
    const observer = new ResizeObserver(check)
    observer.observe(sheet)
    observer.observe(aside)
    check()
    return () => observer.disconnect()
  }, [frame, creature])
}

function CreatureDetail({
  campaignId,
  item,
  catalog,
  favorite,
  toggleFavorite,
  inSheet,
  onViewArt,
  onAdd,
  onCustomise,
  onEdit,
  onComplete,
  onDuplicate,
  onDelete,
  onRemove,
  onRestore,
  onCopied,
}: {
  campaignId: string
  item: CreatureListItem
  catalog: ReturnType<typeof useCreatureCatalog>
  favorite: boolean
  toggleFavorite: () => void
  inSheet: boolean
  /** The image viewer is open (it owns Escape over the phone sheet). */
  onViewArt: (open: boolean) => void
  onAdd: (target: HTMLElement) => void
  onCustomise: (target: HTMLElement) => void
  onEdit: (target: HTMLElement) => void
  onComplete: (target: HTMLElement) => void
  onDuplicate: (target: HTMLElement) => void
  onDelete: (target: HTMLElement) => void
  /** RYT-089: removes an official creature (or its campaign version) from the campaign. */
  onRemove: (target: HTMLElement) => void
  /** RYT-089: deletes the campaign version, the official creature is listed again. */
  onRestore: (target: HTMLElement) => void
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
      {item.version ? (
        <VersionNote onRestore={onRestore} />
      ) : (
        <>
          <Badge variant="light" className={`bst-source-badge is-${item.source}`}>
            {t(`bestiary.badge.${item.source}`)}
          </Badge>
          {based && <Badge variant="outline">{t('bestiary.basedOn', { name: based })}</Badge>}
        </>
      )}
      {item.legendary > 0 && (
        <Badge variant="outline">{t('bestiary.legendaryBadge', { count: item.legendary })}</Badge>
      )}
    </>
  )
  // Menu items unmount with the menu: overlays they open return focus to the ⋯ button.
  const more = useRef<HTMLButtonElement>(null)
  const fromMenu = () => more.current ?? document.body
  // RYT-088: a creature with an image leads with its plate (above the name, or in its own column on
  // wide panes); without one the token stays the file picker beside the name.
  const pictured = Boolean(item.imagePath) || Boolean(itemArt(item))
  // The stat column appears with the first image too (RYT-091): the check follows it.
  const frame = useRef<HTMLDivElement>(null)
  useColumnFit(frame, `${item.key}:${block ? 'block' : 'quick'}:${pictured ? 'plate' : 'token'}`)
  // Kept here so a save's notice and focus survive the token turning into the plate; another
  // creature starts without one.
  const [artNotice, setArtNotice] = useState<(ArtNotice & { key: string }) | null>(null)
  const [noticeFor, setNoticeFor] = useState(item.key)
  if (noticeFor !== item.key) {
    setNoticeFor(item.key)
    setArtNotice(null)
  }
  const media = (
    <CreatureArtControl
      // Another creature: the control's own state (viewer, errors) starts fresh.
      key={item.key}
      campaignId={campaignId}
      name={item.name}
      side={item.side ?? 'enemy'}
      type={item.type}
      target={
        template ? { templateId: template.id, revision: template.revision } : { srdId: item.id }
      }
      imagePath={item.imagePath ?? null}
      art={itemArt(item)}
      credit={catalog.artCredit(item.artId)}
      notice={artNotice?.key === item.key ? artNotice : null}
      onNotice={(next) => setArtNotice(next && { ...next, key: item.key })}
      onViewing={onViewArt}
    />
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
          // RYT-089: editing an official creature keeps the change in this campaign.
          <Button
            variant="light"
            leftSection={<Pencil size={16} aria-hidden="true" />}
            disabled={!block}
            data-bst-edit
            onClick={(e) => onCustomise(e.currentTarget)}
          >
            {t('bestiary.edit')}
          </Button>
        ) : (
          <Button
            variant="light"
            leftSection={<Pencil size={16} aria-hidden="true" />}
            data-bst-edit
            onClick={(e) => onEdit(e.currentTarget)}
          >
            {t('bestiary.edit')}
          </Button>
        )}
        {/* The bookmark and the menu wrap together, so the text action keeps its word. */}
        <div className="bst-actions-icons">
          <ActionIcon
            variant="subtle"
            size={44}
            aria-pressed={favorite}
            aria-label={t(favorite ? 'bestiary.favorite.remove' : 'bestiary.favorite.add', {
              name: item.name,
            })}
            onClick={toggleFavorite}
          >
            <Bookmark size={18} aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} />
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
              {block && item.source === 'homebrew' && (
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
              {(item.source === 'srd' || item.version) && (
                <Menu.Item
                  className="bst-menu-danger"
                  leftSection={<BookMinus size={16} aria-hidden="true" />}
                  onClick={() => onRemove(fromMenu())}
                >
                  {t('bestiary.official.removeOne')}
                </Menu.Item>
              )}
              {item.source === 'homebrew' && !item.version && (
                <Menu.Item
                  className="bst-menu-danger"
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
        {/* First in the tab order; on phones it sticks to the bottom of the sheet (CSS order). */}
        {actions}
        {/* The same frame as a full stat block, so the plate keeps its column on wide panes. */}
        <div className="bst-detail-frame">
          <div className={pictured ? 'bst-detail-body has-plate' : 'bst-detail-body'}>
            {pictured && media}
            <Stack gap="md" className="bst-quick">
              <header className="sb-head">
                {!pictured && media}
                <div className="sb-title">
                  <Title order={inSheet ? 2 : 3} id={headingId} className="sb-name">
                    {item.name}
                  </Title>
                  <div className="sb-badges">{badges}</div>
                </div>
              </header>
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
              <Alert
                variant="light"
                role="note"
                icon={<FilePenLine size={18} aria-hidden="true" />}
              >
                <Text size="sm">{t('bestiary.quickHint')}</Text>
                <Button mt="xs" variant="light" onClick={(e) => onComplete(e.currentTarget)}>
                  {t('bestiary.complete')}
                </Button>
              </Alert>
            </Stack>
          </div>
        </div>
      </Stack>
    )
  }
  return (
    <Stack gap="md" className="bst-detail-inner">
      {actions}
      <div className="bst-detail-frame" ref={frame}>
        <div className="bst-detail-body">
          {/* RYT-091: the plate goes inside the block, which lays it out by the frame's width. */}
          <StatBlockView
            block={block}
            level={inSheet ? 2 : 3}
            headingId={headingId}
            media={pictured ? undefined : media}
            plate={pictured ? media : undefined}
            badges={badges}
            footnote={
              row
                ? t('bestiary.srdPage', { page: row.pages[catalog.language] })
                : template?.notes
                  ? t('bestiary.notesLine', { notes: template.notes })
                  : undefined
            }
          />
        </div>
      </div>
    </Stack>
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
        template ? t('combat.bestiary.edit', { name: template.name }) : t('bestiary.quick.title')
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
          <SideToggle legend={t('combat.add.side')} name={name} value={side} onChange={setSide} />
          <div className="combat-grid-2">
            <NumberDial
              label={t('combat.add.maxHp')}
              icon={Heart}
              min={1}
              max={99999}
              value={maxHp}
              onChange={setMaxHp}
            />
            <NumberDial
              label={t('combat.add.ac')}
              icon={Shield}
              min={0}
              max={99}
              value={ac}
              onChange={setAc}
            />
            <NumberDial
              label={t('combat.add.bonus')}
              icon={Zap}
              min={-20}
              max={30}
              value={bonus}
              onChange={setBonus}
            />
            <NumberDial
              label={t('combat.add.legendary')}
              icon={Crown}
              min={0}
              max={9}
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
