import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Menu,
  Text,
  Title,
  VisuallyHidden,
  Drawer as CreatureDrawer,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/shared/ui/overlays'
import { afterOverlayEntriesSettle } from '@/shared/ui/use-back-to-close'
import { ArrowLeft, Ellipsis, PawPrint, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '@/features/auth'
import {
  challengeRatings,
  emptyFilters,
  filterCreatures,
  packTitle,
  referenceKey,
  type CreatureFilters,
  type CreatureListItem,
  type CreatureType,
} from '@/features/bestiary'
import { QueryFeedback } from '@/features/campaigns'
import { usePhone } from '@/shared/ui/use-viewport'
import { useBasePackLabel } from '@/shared/ui/pack-origins-context'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { StatusRail } from '@/shared/ui/rail-line'
import { encountersQuery } from '../api'
import type { CombatantTemplate } from '../domain/combat'
import { searchCreatures } from '../domain/creature-search'
import { AddToEncounterDialog } from './add-to-encounter'
import { focusAddButton } from './focus-add'
import { BestiaryComparison } from './bestiary-encounter'
import { CreatureDetail } from './bestiary-detail'
import { CreatureList } from './bestiary-list'
import { Toolbar } from './bestiary-toolbar'
import { CreatureEditor } from './creature-editor'
import { blankDraft, draftFromBlock, type CreatureDraft } from './creature-draft'
import { templateBlock, useCreatureCatalog } from './creatures'
import { addedLine } from './encounter-add'
import { useEncounterAdd } from './encounter-add'
import { useRunner } from './helpers'
import { recallEncounter } from './last-encounter'
import { NewCreatureDialog } from './new-creature'
import { OfficialDialog, PacksMenuItem, PacksMissing, type OfficialAsk } from './official-bestiary'
import { RunnerError } from './parts'
import { QuickDialog } from './quick-creature'
import './bestiary.css'

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
 * From 48em the stat block opens in a pane beside the list, inside the panel area, when the panel
 * has room for both (32rem: a 14rem list and an 18rem stat block, so large text needs more width):
 * a tablet or a laptop with 150% text gets the full screen sheet instead.
 */
function useSplit(sideBySide: boolean) {
  const ref = useRef<HTMLElement>(null)
  const [roomy, setRoomy] = useState(true)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node || !sideBySide) return
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      setRoomy(node.getBoundingClientRect().width >= 32 * rem)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [sideBySide])
  return { ref, split: sideBySide && roomy }
}

type EditorState = {
  draft: CreatureDraft
  template: CombatantTemplate | null
  unplaced?: string[]
  /** The SRD creature a customised copy starts from (shown in the editor title). */
  basedOn?: string
  /** RYT-089: a new campaign version of that official creature (edited in place). */
  version?: boolean
  reference?: CreatureListItem
}

/**
 * DM Command Center → Bestiary (ADR 028): the SRD 5.2.1 catalogue and the campaign's own
 * creatures in one searchable list, a full stat block beside it (a full screen sheet on phones),
 * and every way to make a creature: quick, from the SRD, from an archetype or from pasted text.
 * Players never reach this panel; templates are DM-only under RLS.
 */
export function BestiaryPanel({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation()
  const baseLabel = useBasePackLabel(t('bestiary.source.srd'))
  const { state } = useAuth()
  const phone = usePhone()
  const { ref: panelRef, split: wide } = useSplit(!phone)
  const catalog = useCreatureCatalog(campaignId)
  const { favorites, toggle } = useFavorites(campaignId)
  const [params, setParams] = useSearchParams()
  const selectedKey = params.get('creature')
  const encounterId = params.get('encounter')
  // The encounters are read for the one-tap add: the fight in the address, the one in progress, or
  // the one opened last in this session. They need no polling here.
  const encounters = useQuery({
    ...encountersQuery(state.user!.id, campaignId),
    refetchInterval: false,
    staleTime: 15_000,
  })
  const targetEncounter = encounterId
    ? encounters.data?.find((encounter) => encounter.id === encounterId)
    : undefined
  const encounter = targetEncounter?.status === 'ended' ? undefined : targetEncounter
  const openEncounters = (encounters.data ?? []).filter((entry) => entry.status !== 'ended')
  const recalled = recallEncounter(campaignId)
  const addTarget = encounterId
    ? encounter
    : (openEncounters.find((entry) => entry.status === 'active' || entry.status === 'initiative') ??
      openEncounters.find((entry) => entry.id === recalled))
  const adds = useEncounterAdd(campaignId)
  const encounterPath = (id: string) => `/campaign/${campaignId}/combat/${id}?view=console`
  const backPath = targetEncounter
    ? encounterPath(targetEncounter.id)
    : `/campaign/${campaignId}/combat`
  const [comparisonKeys, setComparisonKeys] = useState<string[]>([])
  const comparison = comparisonKeys.flatMap((key) => {
    const item = catalog.items.find((candidate) => candidate.key === key)
    return item ? [item] : []
  })
  const compared = comparison.map((item) => item.key)
  const toggleComparison = (key: string) =>
    setComparisonKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...compared, key],
    )
  // What the last action did (saved, copied, hidden, favourite) is one rail line, as in the
  // storeroom. Every message has a serial, so the same sentence said twice reads as new again.
  const [noticeState, setNoticeState] = useState<{ text: string; serial: number } | null>(null)
  const noticeSerial = useRef(0)
  const setNotice = (text: string | null) =>
    setNoticeState(text === null ? null : { text, serial: ++noticeSerial.current })
  const notice = noticeState?.text ?? null
  const toggleFavorite = (item: CreatureListItem) => {
    const saved = !favorites.has(item.key)
    toggle(item.key)
    setNotice(
      t(saved ? 'bestiary.favorite.saved' : 'bestiary.favorite.unsaved', { name: item.name }),
    )
  }
  const [filters, setFilters] = useState<CreatureFilters>(emptyFilters)
  const [adding, setAdding] = useState<CreatureListItem | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [creating, setCreating] = useState(false)
  const [quick, setQuick] = useState<{
    template: CombatantTemplate | null
    variantOf?: CombatantTemplate
  } | null>(null)
  const [deleting, setDeleting] = useState<CombatantTemplate | null>(null)
  const [asking, setAsking] = useState<OfficialAsk | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  // After going back to the official creature, focus waits for its stat block's Edit button.
  const focusEdit = useRef<string | null>(null)
  const { run, pending, error, trigger, clear } = useRunner(campaignId)
  // Focus returns to the control that opened an overlay, or to the search when it is gone.
  const restore = () => {
    const node = opener.current
    requestAnimationFrame(() =>
      (node?.isConnected
        ? node
        : (rowOf(lastKey.current) ?? document.getElementById('bestiary-search'))
      )?.focus(),
    )
  }
  // A dialog over the phone sheet owns Escape: the sheet stays open underneath.
  const [viewingArt, setViewingArt] = useState(false)
  const overlayOpen =
    Boolean(adding || editor || quick || deleting || asking) || creating || viewingArt
  // RYT-179: `?do=new` (from the quick switcher) starts a new creature once and leaves the URL.
  const startNew = params.get('do') === 'new'
  const [startedNew, setStartedNew] = useState(false)
  if (startNew !== startedNew) {
    setStartedNew(startNew)
    if (startNew) setCreating(true)
  }
  useEffect(() => {
    if (!startNew) return
    opener.current = null
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('do')
        return next
      },
      { replace: true },
    )
  }, [startNew, setParams])
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
      searchCreatures(
        filterCreatures(catalog.items, { ...filters, query: '' }, favorites, challengeRatings),
        deferredQuery,
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
  // Opening a creature adds a history entry, so system Back closes it like Escape does; closing
  // by hand undoes that entry instead of leaving a duplicate behind.
  const navigate = useNavigate()
  const pushed = useRef(false)
  const select = (key: string | null) => {
    // An overlay over the creature (the editor, a confirmation) gives its history entry back
    // asynchronously; a replace or a Back made before that lands on the overlay's entry and the
    // pending Back then restores the old creature or pops the wrong entry. Wait for them first.
    void afterOverlayEntriesSettle().then(() => {
      if (key === null && pushed.current) {
        pushed.current = false
        void navigate(-1)
        return
      }
      const adding = key !== null && selectedKeyRef.current === null
      if (adding) pushed.current = true
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (key) next.set('creature', key)
          else next.delete('creature')
          return next
        },
        { replace: !adding },
      )
    })
  }
  const selectedKeyRef = useRef(selectedKey)
  useEffect(() => {
    selectedKeyRef.current = selectedKey
  })
  // The row of the creature that was open: where focus returns when it closes, by any route.
  const lastKey = useRef<string | null>(null)
  const rowOf = (key: string | null) =>
    key
      ? document.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(key)}"] .bst-row-main`)
      : null
  const refocused = useRef<string | null>(null)
  useEffect(() => {
    if (selectedKey) {
      lastKey.current = selectedKey
      refocused.current = null
      return
    }
    pushed.current = false
    const key = lastKey.current
    if (!key || overlayOpen || refocused.current === key) return
    refocused.current = key
    // Back, Escape and "Volver a la lista" all end on the row that was open.
    focusWhenReady(() => rowOf(key))
  }, [selectedKey, overlayOpen])
  // Beside the stat block Escape closes the pane; focus goes back to its row (see below).
  useEffect(() => {
    if (!wide || !selectedKey) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (document.querySelector('[role="dialog"], [role="menu"]')) return
      if (!(event.target as HTMLElement | null)?.closest('.bst-list, .bst-detail')) return
      event.preventDefault()
      // Focus returns to the row it is on, even when the pane has not caught up with an arrow yet.
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-row-key]')
      if (row?.dataset.rowKey) lastKey.current = row.dataset.rowKey
      select(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })
  useEffect(() => {
    if (!focusEdit.current || selected?.key !== focusEdit.current) return
    focusEdit.current = null
    // A frame later, once the phone sheet has taken focus back from the closed dialog.
    requestAnimationFrame(() =>
      [...document.querySelectorAll<HTMLElement>('[data-bst-more]')]
        .find((node) => node.getClientRects().length > 0)
        ?.focus(),
    )
  })
  const noticeRail = (text: string | null) => (
    <StatusRail className="bst-notice" text={text} serial={noticeState?.serial}>
      <ActionIcon
        variant="subtle"
        size={44}
        aria-label={t('common.close')}
        onClick={() => setNotice(null)}
      >
        <X size={16} aria-hidden="true" />
      </ActionIcon>
    </StatusRail>
  )
  const blockOf = catalog.blockFor
  // RYT-094: the campaign uses no creature pack: Content is where it chooses them.
  const noPacks = catalog.noPacks
  // Neither creatures nor a creature pack yet: choosing packs is the page's one primary action.
  const empty = !catalog.pending && catalog.items.length === 0 && noPacks
  // The source filter: one segment per enabled pack ("SRD" for the SRD, its title in a list).
  const sourcePacks = catalog.packs
    .filter((pack) => pack.enabled)
    .map((pack) => ({
      id: pack.id,
      title: packTitle(pack, catalog.language),
      short: pack.srd ? baseLabel : t('bestiary.source.pack'),
    }))
  const ask = (next: OfficialAsk, target: HTMLElement) => {
    opener.current = target
    setAsking(next)
  }
  const confirmOfficial = async (next: OfficialAsk) => {
    // Going back to the pack creature: its key already shows the version, so the open stat block
    // never closes in between (and keeps its focus) when the version is deleted.
    const officialKey = next.template.srd_id ? `srd:${next.template.srd_id}` : null
    if (officialKey) select(officialKey)
    if (!(await run({ kind: 'deleteTemplate', templateId: next.template.id }))) return
    setAsking(null)
    setNotice(t('bestiary.official.restored', { name: next.template.name }))
    if (officialKey) {
      focusEdit.current = officialKey
      return
    }
    select(null)
    restore()
  }
  // RYT-094: hiding is undone from Content, so it needs no question.
  const hide = async (item: CreatureListItem) => {
    const reference = item.source === 'srd' ? item.id : item.srdId
    if (!item.packId || !reference) return
    if (!(await run({ kind: 'hideCreature', packId: item.packId, key: referenceKey(reference) })))
      return
    select(null)
    setNotice(t('bestiary.packs.hidden', { name: item.name }))
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
      // Another creature starts with its own picture state, count and status.
      key={selected.key}
      campaignId={campaignId}
      item={selected}
      catalog={catalog}
      favorite={favorites.has(selected.key)}
      toggleFavorite={() => toggleFavorite(selected)}
      encounterId={encounterId}
      encounter={encounter}
      target={addTarget ? { id: addTarget.id, name: addTarget.name } : null}
      adds={adds}
      encounterPath={encounterPath}
      comparisonKeys={compared}
      toggleComparison={toggleComparison}
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
          reference: selected,
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
        if (!block) setQuick({ template })
        else setEditor({ template, draft: draftFromTemplate(template), reference: selected })
      }}
      onComplete={(target) => {
        opener.current = target
        const template = templateOf(selected)
        if (!template) return
        setEditor({ template, draft: draftFromTemplate(template), reference: selected })
      }}
      onDuplicate={(target) => {
        opener.current = target
        const template = templateOf(selected)
        const block = selected.source === 'srd' ? blockOf(selected) : templateBlock(template)
        if (!block) {
          if (template) setQuick({ template: null, variantOf: template })
          return
        }
        const base = template
          ? draftFromTemplate(template)
          : draftFromBlock(t, catalog.language, block, {
              size: selected.size[0],
              type: selected.type,
              cr: selected.cr,
              legendary: selected.legendary,
              srdId: selected.id,
            })
        setEditor({
          template: null,
          basedOn: selected.name,
          reference: selected,
          draft: {
            ...base,
            name: t('bestiary.variantName', { name: selected.name }).slice(0, 80),
          },
        })
      }}
      onDelete={(target) => {
        opener.current = target
        setDeleting(templateOf(selected))
      }}
      onHide={(target) => {
        opener.current = target
        void hide(selected)
      }}
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
      <div className={!encounterId && !empty ? 'bst-head is-quiet' : 'bst-head'}>
        <div className="bst-head-title">
          <Group gap="xs" wrap="nowrap">
            <PawPrint size={20} className="feature-icon" aria-hidden="true" />
            <Title order={encounterId ? 1 : 2} id="bestiary-heading">
              {t('bestiary.title')}
            </Title>
          </Group>
          {targetEncounter && (
            <Text fw={650} className="bst-context-name">
              {targetEncounter.name}
            </Text>
          )}
        </div>
        {(encounterId || empty) && (
          <div className="bst-head-actions">
            {encounterId && (
              <Button
                component={Link}
                to={backPath}
                variant="subtle"
                leftSection={<ArrowLeft size={16} aria-hidden="true" />}
              >
                {t(targetEncounter ? 'bestiary.context.back' : 'bestiary.context.backList')}
              </Button>
            )}
            {/* Nothing to list yet: a new creature is the way in. Otherwise it is in the ··· menu. */}
            {empty && (
              <Button
                variant="outline"
                leftSection={<Plus size={16} aria-hidden="true" />}
                onClick={(event) => {
                  opener.current = event.currentTarget
                  setCreating(true)
                }}
              >
                {t('bestiary.new')}
              </Button>
            )}
          </div>
        )}
      </div>
      {encounterId && (
        <>
          <QueryFeedback
            pending={encounters.isPending}
            error={encounters.isError && !encounters.data}
            retry={() => void encounters.refetch()}
          />
          {encounters.isSuccess && !encounter && (
            <Alert role="status">{t('bestiary.context.unavailable')}</Alert>
          )}
        </>
      )}
      <RunnerError error={error} trigger={trigger} onClose={clear} />
      {/* On phones and tablets an open sheet covers the page: the notice shows inside it. */}
      {noticeRail(wide || !selected ? notice : null)}
      {/* RYT-094: nothing to search before the campaign has a creature or a creature pack. */}
      {!catalog.dataError && (catalog.pending || catalog.items.length > 0 || !noPacks) && (
        <Toolbar
          packs={sourcePacks}
          filters={filters}
          setFilters={setFilters}
          activeFilters={activeFilters}
          count={results.length}
          menu={
            !encounterId ? (
              <Menu position="bottom-end" withinPortal zIndex={420}>
                <Menu.Target>
                  <ActionIcon
                    variant="default"
                    size={48}
                    className="bst-head-menu"
                    aria-label={t('bestiary.headMenu')}
                  >
                    <Ellipsis size={20} aria-hidden="true" />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<Plus size={16} aria-hidden="true" />}
                    onClick={() => {
                      opener.current = document.querySelector<HTMLElement>('.bst-head-menu')
                      setCreating(true)
                    }}
                  >
                    {t('bestiary.new')}
                  </Menu.Item>
                  {!catalog.pending && !noPacks && <PacksMenuItem campaignId={campaignId} />}
                </Menu.Dropdown>
              </Menu>
            ) : undefined
          }
          onFirst={() => document.querySelector<HTMLElement>('.bst-row-main')?.focus()}
          onEnter={() => results[0] && select(results[0].key)}
        />
      )}
      <QueryFeedback pending={catalog.pending} error={catalog.error} retry={catalog.retry} />
      {!catalog.pending && noPacks && (
        <PacksMissing campaignId={campaignId} compact={catalog.items.length > 0} />
      )}
      {!catalog.pending && catalog.unreadable > 0 && (
        <Text size="sm" c="dimmed" role="note">
          {t('bestiary.packs.unreadable', { count: catalog.unreadable })}
        </Text>
      )}
      {encounter && comparison.length > 0 && (
        <BestiaryComparison
          items={comparison}
          onRead={(key, target) => {
            opener.current = target
            select(key)
          }}
          onRemove={toggleComparison}
        />
      )}
      {/* RYT-094: a library that cannot be reached shows only its error, never an empty list. */}
      {!catalog.pending && !catalog.dataError && (catalog.items.length > 0 || !noPacks) && (
        <div className={wide ? 'bst-split' : undefined} data-pane={(wide && selected) || undefined}>
          <CreatureList
            grouping={deferredQuery.trim() ? null : filters.sort === 'cr' ? 'cr' : 'letter'}
            showPack={catalog.severalPacks}
            favorites={favorites}
            items={results}
            selectedKey={selectedKey}
            followSelection={wide && Boolean(selected)}
            comparisonKeys={encounter ? compared : undefined}
            toggleComparison={toggleComparison}
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
          {wide && selected && (
            <div className="bst-detail" aria-live="off">
              {detail}
            </div>
          )}
        </div>
      )}
      {!wide && (
        // Opening a creature owns a router history entry (see select), so no second Back entry here.
        <CreatureDrawer
          opened={Boolean(selected)}
          onClose={() => {
            select(null)
            restore()
          }}
          position="bottom"
          size="100%"
          title={
            <>
              <span aria-hidden="true" className="bst-context-name">
                {targetEncounter?.name ?? t('bestiary.title')}
              </span>
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
          {noticeRail(notice)}
          {detail}
        </CreatureDrawer>
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
            setQuick({ template: null })
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
          reference={editor.reference}
          campaignScope
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
            restore()
          }}
        />
      )}
      {quick && (
        <QuickDialog
          template={quick.template}
          variantOf={quick.variantOf}
          pending={pending}
          close={() => {
            setQuick(null)
            restore()
          }}
          save={async (data) => {
            await run(
              {
                kind: 'saveTemplate',
                templateId: quick.template?.id ?? null,
                revision: quick.template?.revision ?? null,
                data,
              },
              ({ id }) => {
                setQuick(null)
                setNotice(t('bestiary.saved', { name: data.name }))
                if (id && !quick.template) select(`hb:${id}`)
                restore()
              },
            )
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
          targetEncounter={encounter}
          onAdded={(added) => {
            adds.setLine(
              addedLine(
                adding,
                added.count,
                { id: added.encounterId, name: added.encounterName },
                added.ids,
              ),
            )
            setAdding(null)
            // The stat block's add button is where the user was: the control that opened the dialog
            // may be gone now (the bar changed shape), and the list row behind the sheet is not it.
            focusAddButton(document.activeElement, {
              fallback: () =>
                opener.current?.isConnected
                  ? opener.current
                  : (rowOf(lastKey.current) ?? document.getElementById('bestiary-search')),
            })
          }}
          onClose={() => {
            setAdding(null)
            restore()
          }}
        />
      )}
      <OfficialDialog
        ask={asking}
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
