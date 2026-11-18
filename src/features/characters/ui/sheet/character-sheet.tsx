import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Moon,
  Pencil,
  SlidersHorizontal,
  Sunset,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { useAuth } from '@/features/auth'
import {
  campaignsQuery,
  isBelowPartyLevel,
  useCampaign,
  useCampaignView,
  useIsRealDm,
} from '@/features/campaigns'
import {
  DiceModeChoice,
  DiceProvider,
  RecentRolls,
  RollHint,
  RollPoint,
  RollResultSlot,
  attackSpecs,
} from '@/features/dice'
import { useSrdLibrary } from '@/features/glossary'
import {
  attacks,
  carriedTenths,
  equippedBySlot,
  inventoryQuery,
  proficiencyBonus,
  SheetAttacks,
} from '@/features/inventory'
import { RestRequestDialog, type RecoveryView } from '@/features/rest'
import { RefreshControl } from '@/shared/ui/refresh-control'
import { newRequestId } from '@/shared/lib/request-id'
import { charactersQuery, playLockQuery, sheetQuery, useSheetAction } from '../../api'
import { syncChanges, syncProgression } from '../../domain/progression'
import { LeaveDialog } from '../leave-guard'
import { useLeaveGuard } from '../use-leave-guard'
import { deathState } from './hp-tone'
import { useResourceNames, useTrackerLabel } from '../resource-names'
import { useSubmitGuard } from '../use-submit-guard'
import {
  acBreakdown,
  finalAbilities,
  initiativeBreakdown,
  restRecovery,
  signed,
  skillBonus,
  slotsFor,
  speedBreakdown,
  spellcasting,
} from '../../domain/rules'
import type { Build, SheetBlock, SheetDraft, SheetRow, Vitals } from '../../domain/sheet'
import { skillKeys } from '../../domain/srd'
import { CreationChooser } from '../creation/chooser'
import { LevelUpPrompt } from '../level-up/level-up-prompt'
import { LevelUpSheet, type LevelUpSnapshot } from '../level-up/level-up-sheet'
import { useCharacterLabels } from '../labels'
import { AbilityStrip } from './abilities'
import { ConditionsBlock, FeaturesBlock, NotesBlock, SkillsBlock, SpellsBlock } from './blocks'
import { SheetHero } from './hero'
import { HistoryBlock } from './history-block'
import { LibraryPicker, type LibraryTab } from './library'
import type { PanelNotice, PanelProps } from './panel-types'
import { PersonaliseDrawer } from './personalise'
import { ResourcesBlock } from './resources-block'
import { BlockSheet } from './widgets'
import './panel.css'

type TileKey = 'resources' | SheetBlock | 'history'

export function CharacterSheetPage() {
  const { t } = useTranslation()
  const { characterId = '' } = useParams()
  const { state } = useAuth()
  const campaign = useCampaign()
  const realDm = useIsRealDm()
  const { playerPreview, previewUserId } = useCampaignView()
  const userId = state.user!.id
  const client = useQueryClient()
  const query = useQuery(sheetQuery(userId, campaign.id, characterId))
  const lock = useQuery({
    ...playLockQuery(userId, campaign.id, characterId),
    enabled: Boolean(query.data?.sheet.build),
  })
  // Exhaustion stays a DM resource on characters; reuse the Party query for it.
  const resources = useQuery(
    charactersQuery(
      userId,
      campaign.id,
      campaign.role === 'dm' ? undefined : playerPreview ? (previewUserId ?? userId) : userId,
    ),
  )
  const [chooser, setChooser] = useState(false)
  const party = `/campaign/${campaign.id}/party`
  const back = (
    <Button
      component={Link}
      to={party}
      variant="subtle"
      leftSection={<ArrowLeft size={18} aria-hidden="true" />}
      className="sheet-back"
    >
      {t('sheet.back')}
    </Button>
  )
  if (query.isPending)
    return (
      <Stack>
        {back}
        <Title order={1}>{t('sheet.title')}</Title>
        <Text role="status">{t('common.loading')}</Text>
      </Stack>
    )
  if (query.isError)
    return (
      <Stack>
        {back}
        <Title order={1}>{t('sheet.title')}</Title>
        <Alert color="red" role="alert">
          {t('query.error')}{' '}
          <Button variant="subtle" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </Alert>
      </Stack>
    )
  if (!query.data)
    return (
      <Stack>
        {back}
        <Title order={1}>{t('sheet.title')}</Title>
        <Paper p="xl">
          <Text>{t('sheet.notFound')}</Text>
        </Paper>
      </Stack>
    )
  const { character, sheet, vitals } = query.data
  // RYT-028: a DM previewing a Player keeps DM write access; the RPCs still authorize server-side.
  // RYT-079: an absent character is read-only for its Player until the DM marks it present.
  const canEdit = realDm || (character.user_id === userId && !character.absent)
  const absentOwner = !realDm && character.user_id === userId && character.absent
  const characterPath = `${party}/${character.id}`
  if (sheet.status === 'draft' || !sheet.build)
    return (
      <Stack gap="lg">
        {back}
        <Title order={1} className="user-copy">
          {character.name}
        </Title>
        <Paper p="xl" className="sheet-draft">
          <Stack align="flex-start">
            <Text>
              {canEdit ? t('sheet.draftHint', { name: character.name }) : t('sheet.draftWaiting')}
            </Text>
            {canEdit &&
              (sheet.build ? (
                <Button component={Link} to={`${characterPath}/create?mode=full`}>
                  {t('sheet.continueCta')}
                </Button>
              ) : (
                <Button onClick={() => setChooser(true)}>{t('sheet.createForCharacter')}</Button>
              ))}
          </Stack>
        </Paper>
        <CreationChooser
          opened={chooser}
          onClose={() => setChooser(false)}
          name={character.name}
          characterPath={characterPath}
        />
      </Stack>
    )
  const exhaustion = resources.data?.find((item) => item.id === character.id)?.character_resources
    .exhaustion
  return (
    <SheetPanel
      key={character.id}
      back={back}
      character={character}
      sheet={sheet}
      build={sheet.build}
      vitals={vitals}
      canEdit={canEdit}
      absentOwner={absentOwner}
      ownSheet={character.user_id === userId}
      locked={Boolean(lock.data?.locked)}
      exhaustion={exhaustion}
      characterPath={characterPath}
      refresh={{
        // The party level may have moved too: the level-up prompt follows it.
        run: () => {
          void query.refetch()
          void client.invalidateQueries({ queryKey: campaignsQuery(userId).queryKey })
        },
        fetching: query.isFetching,
        updatedAt: query.dataUpdatedAt,
      }}
    />
  )
}

const fromSheet = (sheet: SheetRow, build: Build, name: string): SheetDraft => ({
  name,
  build,
  level: sheet.level,
  maxHp: sheet.max_hp,
  armorClass: sheet.armor_class,
})

function SheetPanel({
  back,
  character,
  sheet,
  build: savedBuild,
  vitals,
  canEdit,
  absentOwner,
  ownSheet,
  locked,
  exhaustion,
  characterPath,
  refresh,
}: {
  back: ReactNode
  character: { id: string; name: string; user_id: string | null }
  sheet: SheetRow
  build: Build
  vitals: Vitals
  canEdit: boolean
  absentOwner: boolean
  /** The viewer plays this character (the rest preview speaks to them). */
  ownSheet: boolean
  locked: boolean
  exhaustion: number | undefined
  characterPath: string
  refresh: { run: () => void; fetching: boolean; updatedAt: number }
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const campaign = useCampaign()
  const realDm = useIsRealDm()
  const action = useSheetAction(campaign.id)
  const submit = useSubmitGuard()
  const resourceNames = useResourceNames()
  const trackerLabel = useTrackerLabel()
  const labels = useCharacterLabels()
  const library = useSrdLibrary()
  const inventory = useQuery(inventoryQuery(state.user!.id, campaign.id, character.id))
  // RYT-133: whose roll is whose, for the characters this account can see.
  const partyList = useQuery(charactersQuery(state.user!.id, campaign.id))
  const rollerNames = useMemo(
    () => new Map((partyList.data ?? []).map((item) => [item.id, item.name])),
    [partyList.data],
  )
  const definitions = useMemo(
    () => new Map((inventory.data?.definitions ?? []).map((d) => [d.id, d])),
    [inventory.data?.definitions],
  )
  const stacks = inventory.data?.stacks
  const equipped = useMemo(() => equippedBySlot(stacks ?? [], definitions), [stacks, definitions])
  const carried = useMemo(() => carriedTenths(stacks ?? [], definitions), [stacks, definitions])
  const [draft, setDraft] = useState<SheetDraft | null>(null)
  const [notice, setNotice] = useState<PanelNotice | null>(null)
  const [open, setOpen] = useState<TileKey | null>(null)
  const [personalise, setPersonalise] = useState(false)
  const [libraryTab, setLibraryTab] = useState<LibraryTab | null>(null)
  const [lastLibraryTab, setLastLibraryTab] = useState<LibraryTab>('spells')
  const [rest, setRest] = useState<'short' | 'long' | null>(null)
  const [leaving, setLeaving] = useState<string | null>(null)
  const [cancelAsk, setCancelAsk] = useState(false)
  const [syncInfo, setSyncInfo] = useState<string | null>(null)
  const [levelUp, setLevelUp] = useState<{
    token: number
    opened: boolean
    snapshot: LevelUpSnapshot
  } | null>(null)
  const [optimistic, setOptimistic] = useState<Vitals | null>(null)
  const inFlight = useRef(false)
  const queued = useRef<{ values: Vitals; done?: PanelNotice } | null>(null)
  const latestRevision = useRef<number | null>(null)
  // Server play state caught up with the last write: drop the local copy.
  useEffect(() => {
    if (!optimistic || inFlight.current || queued.current) return
    if (latestRevision.current === null || vitals.revision >= latestRevision.current) {
      latestRevision.current = null
      setOptimistic(null)
    }
  }, [vitals.revision, optimistic])
  const shownVitals = optimistic ?? vitals
  const restOpener = useRef<HTMLElement | null>(null)
  const pencil = useRef<HTMLButtonElement>(null)
  const editHeading = useRef<HTMLParagraphElement>(null)
  const editing = draft !== null
  // RYT-130: the DM raised the party level above this finished character; its Player levels up.
  const levelUpDue =
    !realDm && ownSheet && canEdit && isBelowPartyLevel(sheet.level, campaign.party_level)
  const openLevelUp = () =>
    setLevelUp((previous) => ({
      token: (previous?.token ?? 0) + 1,
      opened: true,
      snapshot: {
        level: sheet.level,
        maxHp: sheet.max_hp,
        build: savedBuild,
        revision: sheet.revision,
      },
    }))
  const saved = fromSheet(sheet, savedBuild, character.name)
  const shown = draft ?? saved
  const build = shown.build
  const shownName = shown.name ?? character.name
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved)
  useLeaveGuard(dirty, setLeaving)
  const openLibrary = (tab: LibraryTab) => {
    setLastLibraryTab(tab)
    setLibraryTab(tab)
  }
  const focusAfter = useRef<'bar' | 'pencil' | null>(null)
  useEffect(() => {
    if (focusAfter.current === 'bar' && editing) editHeading.current?.focus()
    if (focusAfter.current === 'pencil' && !editing) pencil.current?.focus()
    focusAfter.current = null
  }, [editing])
  const startEditing = () => {
    setNotice(null)
    focusAfter.current = 'bar'
    setDraft(saved)
  }
  // The pencil comes back when editing ends; focus returns to it instead of the page.
  const stopEditing = () => {
    focusAfter.current = 'pencil'
    setDraft(null)
  }

  // RYT-071: class resources and features follow class and level on every save, once the
  // glossary index is there (without it, nothing is added or dropped).
  const progress = (next: SheetDraft): SheetDraft => {
    const synced = library
      ? syncProgression(next.build, next.level, library.features, resourceNames)
      : next.build
    return {
      ...next,
      build: synced,
      armorClass: acBreakdown(synced, equipped, next.level).total,
    }
  }
  const validName = shownName.trim().length > 0
  const save = async (next: SheetDraft, done?: PanelNotice, then?: () => void) => {
    // One write at a time: controls stay focusable while saving and taps wait for the result.
    // The guard is a ref, so a double tap cannot slip a second request in before the next render.
    if (action.isPending || submit.busy) return
    const nextName = (next.name ?? character.name).trim()
    if (!nextName) return
    const progressed = progress(next)
    // A save that also brought class features or resources up to date says so (legacy sheets).
    const changes = syncChanges(next.build, progressed.build)
    const synced =
      JSON.stringify([progressed.build.features, progressed.build.trackers]) !==
      JSON.stringify([next.build.features, next.build.trackers])
    const sheetChanged =
      JSON.stringify({
        build: progressed.build,
        level: progressed.level,
        maxHp: progressed.maxHp,
        armorClass: progressed.armorClass,
      }) !==
      JSON.stringify({
        build: saved.build,
        level: saved.level,
        maxHp: saved.maxHp,
        armorClass: saved.armorClass,
      })
    const nameChanged = nextName !== character.name
    try {
      const finished = await submit.run(async () => {
        setNotice(null)
        setSyncInfo(null)
        if (sheetChanged || !nameChanged) {
          const key = `save:${sheet.revision}:${JSON.stringify(progressed)}`
          await action.mutateAsync({
            kind: 'save',
            characterId: character.id,
            expectedRevision: sheet.revision,
            draft: progressed,
            complete: true,
            requestId: submit.idFor(key),
          })
          submit.done(key)
        }
        if (nameChanged) {
          const key = `rename:${nextName}`
          await action.mutateAsync({
            kind: 'rename',
            characterId: character.id,
            name: nextName,
            requestId: submit.idFor(key),
          })
          submit.done(key)
        }
        return true
      })
      if (!finished) return
      if (synced) {
        const lines = [
          ...changes.changed.map(
            ({ tracker, from }) => `${trackerLabel(tracker)}: ${from} → ${tracker.max}`,
          ),
          ...changes.added.map((tracker) => `${trackerLabel(tracker)} (${tracker.max})`),
          ...(changes.features > 0 ? [t('panel.syncedFeatures', { count: changes.features })] : []),
        ]
        setSyncInfo(lines.length ? lines.join('; ') : null)
      }
      setNotice(synced ? 'panel.synced' : (done ?? 'sheet.saved'))
      then?.()
    } catch {
      // Mutation state exposes error feedback inside the panel alert.
    }
  }
  const commit = (values: Vitals, done?: PanelNotice) => {
    setNotice(null)
    setOptimistic(values)
    queued.current = { values, done }
    pump()
  }
  // One play-state write at a time; the newest tap waits and is sent on the fresh revision, so
  // quick taps (two slots, three pips) all count. The sheet shows the tapped state meanwhile.
  const pump = () => {
    if (inFlight.current || !queued.current) return
    const { values, done } = queued.current
    queued.current = null
    inFlight.current = true
    const revision = latestRevision.current ?? values.revision
    action
      .mutateAsync({
        kind: 'vitals',
        characterId: character.id,
        values: { ...values, revision },
        requestId: newRequestId(),
      })
      .then((next) => {
        latestRevision.current = typeof next === 'number' ? next : revision + 1
        if (!queued.current) setNotice(done ?? null)
      })
      .catch(() => {
        queued.current = null
        latestRevision.current = null
        setOptimistic(null)
      })
      .finally(() => {
        inFlight.current = false
        pump()
      })
  }
  const change: PanelProps['change'] = (update, done) => {
    if (draft) setDraft((current) => (current ? update(current) : current))
    else void save(update(saved), done)
  }
  const ac = acBreakdown(build, equipped, shown.level)
  const speed = speedBreakdown(build, shown.level, { equipped, carriedTenths: carried })
  const init = initiativeBreakdown(build, shown.level)
  const monkLevel = build.classKey === 'monk' ? shown.level : 0
  const attackList = attacks(finalAbilities(build), proficiencyBonus(shown.level), equipped, {
    monkLevel,
    includeUnarmed: true,
    unarmedName: t('inventory.attacks.unarmed'),
  })
  const props: PanelProps = {
    campaignId: campaign.id,
    characterId: character.id,
    name: shownName,
    build,
    level: shown.level,
    maxHp: shown.maxHp,
    armorClass: draft || inventory.data ? ac.total : sheet.armor_class,
    ac,
    speed,
    init,
    equipped,
    carriedTenths: carried,
    attacks: attackList,
    sheet,
    vitals: shownVitals,
    canEdit,
    editing,
    pending: action.isPending,
    locked,
    levelLocked: !realDm,
    commit,
    change,
    onStartEdit: canEdit && !editing && !action.isPending ? startEditing : undefined,
  }
  const hidden = new Set(build.layout?.hidden ?? [])
  const caster = build.casterKind !== 'none' || build.spells.length > 0
  const tiles: TileKey[] = [
    'resources' as const,
    ...(['skills', 'attacks', 'features', 'conditions', 'spells', 'notes'] as const).filter(
      (key) => !hidden.has(key) && (key !== 'spells' || caster),
    ),
    'history' as const,
  ]
  const tileTitle = (key: TileKey) =>
    key === 'resources'
      ? t('panel.resourcesTitle')
      : key === 'history'
        ? t('panel.history')
        : t(`panel.block.${key}`)
  const glance = useGlance(props, exhaustion)
  const detail: Record<TileKey, ReactNode> = {
    resources: <ResourcesBlock {...props} onPersonalise={() => setPersonalise(true)} />,
    skills: <SkillsBlock {...props} />,
    attacks: (
      <>
        <RollHint />
        <SheetAttacks
          lines={attackList}
          renderRoll={(line, part, content) => {
            const specs = attackSpecs(line)
            const spec = part === 'hit' ? specs.hit : specs.damage
            return (
              <RollPoint spec={editing ? null : spec} formula="replace">
                {content}
              </RollPoint>
            )
          }}
        />
      </>
    ),
    features: <FeaturesBlock {...props} onLibrary={() => openLibrary('features')} />,
    conditions: <ConditionsBlock {...props} exhaustion={exhaustion} />,
    spells: <SpellsBlock {...props} onLibrary={() => openLibrary('spells')} />,
    notes: <NotesBlock {...props} />,
    history: <HistoryBlock campaignId={campaign.id} characterId={character.id} build={build} />,
  }
  const subtitle = [
    t('sheet.classLevel', { class: labels.className(build), level: shown.level }) +
      (build.subclass ? ` (${build.subclass})` : ''),
    // An origin left open is not printed as "Unset, Unset".
    [
      build.speciesKey || build.speciesLabel.trim() ? labels.speciesName(build) : '',
      build.backgroundKey || build.backgroundLabel.trim() ? labels.backgroundName(build) : '',
    ]
      .filter(Boolean)
      .join(', '),
  ]
    .filter(Boolean)
    .join('\n')
  const errorKey =
    action.error?.message === 'stale'
      ? 'sheet.stale'
      : action.error?.message === 'locked'
        ? 'panel.lockedError'
        : action.error?.message === 'forbidden'
          ? 'sheet.forbidden'
          : action.error?.message === 'level-up'
            ? 'levelUp.error.useLevelUp'
            : 'sheet.unavailable'
  // What a save changed on class resources is said in the open sheet too, where the player is
  // looking, and lists what moved.
  const syncedNote =
    notice === 'panel.synced' ? (
      <Alert color="blue" role="status" mb="md" className="panel-synced">
        {t('panel.synced')}
        {syncInfo ? ` ${syncInfo}.` : ''}
      </Alert>
    ) : null
  const errorAlert =
    action.isError || syncedNote ? (
      <>
        {action.isError && (
          <Alert color="red" role="alert" mb="md">
            {t(errorKey)}
          </Alert>
        )}
        {syncedNote}
      </>
    ) : null
  const closeRest = () => {
    setRest(null)
    requestAnimationFrame(() => restOpener.current?.focus())
  }
  // RYT-080: what this character would get back; the DM asks for the group without one.
  const recovery = rest ? restRecovery(shownVitals, build, shown.maxHp, shown.level, rest) : null
  const restPreview: RecoveryView | null =
    recovery && ownSheet
      ? {
          ...recovery,
          trackers: recovery.trackers.map((tracker) => ({
            id: tracker.id,
            label: tracker.key
              ? t(`panel.resource.${tracker.key}` as 'panel.resource.monk-focus', {
                  defaultValue: tracker.name,
                })
              : tracker.name,
            before: tracker.before,
            after: tracker.after,
          })),
        }
      : null
  return (
    <DiceProvider campaignId={campaign.id} characterId={character.id} canRoll={canEdit && !editing}>
      <Stack gap="md" className="character-sheet panel-sheet" data-editing={editing || undefined}>
        <Group justify="space-between" wrap="nowrap" gap="xs" className="sheet-header">
          {back}
          <Group gap="xs" wrap="nowrap" className="sheet-header-actions">
            <RefreshControl
              onRefresh={refresh.run}
              fetching={refresh.fetching}
              updatedAt={refresh.updatedAt}
            />
            {canEdit && !editing && (
              <Tooltip label={t('panel.edit')} events={{ hover: true, focus: true, touch: true }}>
                <ActionIcon
                  ref={pencil}
                  size={44}
                  className="sheet-tool"
                  aria-label={t('panel.edit')}
                  onClick={() => {
                    if (!action.isPending) startEditing()
                  }}
                >
                  <Pencil size={20} aria-hidden="true" />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>
        {editing && (
          <div className="panel-editbar" role="region" aria-label={t('panel.editing')}>
            <Text fw={600} ref={editHeading} tabIndex={-1} className="panel-editbar-title">
              {t('panel.editing')}
            </Text>
            <Text size="sm" c="dimmed" className="panel-editbar-hint">
              {t('panel.editingHint')}{' '}
              <Link to={`${characterPath}/create?mode=full`}>{t('panel.fullWizard')}</Link>
            </Text>
            <EditActions
              pending={action.isPending}
              disabled={!validName}
              onCancel={() => {
                // A dirty draft asks first, as leaving the page does.
                if (dirty) return setCancelAsk(true)
                action.reset()
                stopEditing()
              }}
              onSave={() => void save(draft, 'sheet.saved', stopEditing)}
            />
          </div>
        )}
        {/* With a sheet open the error shows inside it instead (never behind, never twice). */}
        {action.isError && open === null && !personalise && libraryTab === null && (
          <Alert color="red" role="alert">
            {t(errorKey)}
          </Alert>
        )}
        <div aria-live="polite" className="visually-hidden-live">
          {action.isPending ? t('sheet.saving') : notice ? t(notice) : ''}
        </div>
        {levelUpDue && !editing && campaign.party_level !== null && (
          <LevelUpPrompt
            name={character.name}
            level={sheet.level}
            party={campaign.party_level}
            locked={locked}
            onStart={openLevelUp}
          />
        )}
        <div className="panel-layout">
          <div className="panel-main">
            <SheetHero
              {...props}
              exhaustion={exhaustion}
              name={shownName}
              subtitle={subtitle}
              note={canEdit ? null : absentOwner ? t('sheet.absentReadOnly') : t('sheet.readOnly')}
            />
            {canEdit && !editing && <DiceModeChoice campaignId={campaign.id} />}
            <AbilityStrip {...props} />
            {open === null && <RollResultSlot where="page" campaignId={campaign.id} />}
            <RecentRolls campaignId={campaign.id} names={rollerNames} />
          </div>
          <section className="panel-tiles-wrap" aria-labelledby="panel-tiles-title">
            <h2 id="panel-tiles-title" className="visually-hidden">
              {t('panel.blocks')}
            </h2>
            <ul className="panel-tiles">
              {tiles.map((key, index) => (
                <li
                  key={key}
                  className="panel-tile-item"
                  // Resources span the row; so does a last tile left alone in its row.
                  data-wide={
                    key === 'resources' ||
                    (index === tiles.length - 1 && (tiles.length - 1) % 2 === 1) ||
                    undefined
                  }
                >
                  <button
                    type="button"
                    className="panel-tile"
                    aria-haspopup="dialog"
                    onClick={() => setOpen(key)}
                  >
                    <span className="panel-tile-title">
                      {tileTitle(key)}
                      <ChevronRight size={18} aria-hidden="true" />
                    </span>
                    <span className="panel-tile-glance">{glance[key]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
        {editing && (
          // Phones: the edit bar scrolls away with the page; the same actions wait at the end.
          <div className="panel-editbar-end" role="group" aria-label={t('panel.editing')}>
            <EditActions
              pending={action.isPending}
              disabled={!validName}
              onCancel={() => {
                // A dirty draft asks first, as leaving the page does.
                if (dirty) return setCancelAsk(true)
                action.reset()
                stopEditing()
              }}
              onSave={() => void save(draft, 'sheet.saved', stopEditing)}
            />
          </div>
        )}
        {canEdit && !editing && (
          <div className="panel-dock" role="group" aria-label={t('sheet.rest')}>
            {(['short', 'long'] as const).map((kind) => (
              <Button
                key={kind}
                variant="default"
                className="panel-dock-rest"
                leftSection={
                  kind === 'short' ? (
                    <Sunset size={18} aria-hidden="true" />
                  ) : (
                    <Moon size={18} aria-hidden="true" />
                  )
                }
                aria-disabled={action.isPending || locked || editing || undefined}
                aria-describedby={locked ? 'panel-rest-locked' : undefined}
                onClick={(event) => {
                  if (action.isPending || locked || editing) return
                  restOpener.current = event.currentTarget
                  setRest(kind)
                }}
              >
                {t(kind === 'short' ? 'sheet.shortRest' : 'sheet.longRest')}
              </Button>
            ))}
            <Tooltip
              label={t('sheet.personaliseHint')}
              events={{ hover: true, focus: true, touch: true }}
            >
              <ActionIcon
                size={44}
                variant="default"
                className="panel-dock-personalise"
                aria-label={t('panel.personalise')}
                aria-haspopup="dialog"
                onClick={() => setPersonalise(true)}
              >
                <SlidersHorizontal size={20} aria-hidden="true" />
              </ActionIcon>
            </Tooltip>
            {locked && (
              <Text size="sm" c="dimmed" id="panel-rest-locked" className="panel-dock-note">
                {t('panel.restLocked')}
              </Text>
            )}
          </div>
        )}
        <BlockSheet
          opened={open !== null}
          closeOnEscape={libraryTab === null && !personalise}
          onClose={() => setOpen(null)}
          title={open ? tileTitle(open) : ''}
          alert={errorAlert}
        >
          {open && detail[open]}
          {open !== null && <RollResultSlot where="sheet" campaignId={campaign.id} />}
        </BlockSheet>
        <PersonaliseDrawer
          opened={personalise}
          onClose={() => setPersonalise(false)}
          props={props}
          alert={errorAlert}
        />
        <LibraryPicker
          opened={libraryTab !== null}
          onClose={() => setLibraryTab(null)}
          tab={libraryTab ?? lastLibraryTab}
          onTab={openLibrary}
          props={props}
          alert={errorAlert}
        />
        <LeaveDialog
          target={leaving}
          onKeep={() => setLeaving(null)}
          onDiscard={(target) => {
            setLeaving(null)
            setDraft(null)
            window.location.href = target
          }}
        />
        <LeaveDialog
          target={cancelAsk ? 'cancel' : null}
          title={t('panel.cancelTitle')}
          body={t('panel.cancelBody')}
          discardLabel={t('panel.discardChanges')}
          onKeep={() => setCancelAsk(false)}
          onDiscard={() => {
            setCancelAsk(false)
            action.reset()
            stopEditing()
          }}
        />
        {levelUp && (
          <LevelUpSheet
            key={levelUp.token}
            opened={levelUp.opened}
            onClose={() => setLevelUp((current) => current && { ...current, opened: false })}
            onAgain={levelUpDue && !locked ? openLevelUp : null}
            campaignId={campaign.id}
            characterId={character.id}
            characterName={character.name}
            snapshot={levelUp.snapshot}
          />
        )}
        <RestRequestDialog
          kind={rest}
          preview={restPreview}
          canRest={shownVitals.current_hp > 0}
          opener={restOpener}
          onClose={closeRest}
        />
        <Text size="sm" c="dimmed" className="srd-license">
          {t('srd.license')}
        </Text>
      </Stack>
    </DiceProvider>
  )
}

/** Cancel and save for edit mode (the bar at the top and its copy at the end on phones). */
function EditActions({
  pending,
  disabled,
  onCancel,
  onSave,
}: {
  pending: boolean
  disabled?: boolean
  onCancel: () => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const blocked = pending || Boolean(disabled)
  return (
    <Group gap="xs" className="panel-editbar-actions">
      <Button
        variant="default"
        className="panel-wrap-button"
        leftSection={<X size={16} aria-hidden="true" />}
        aria-disabled={pending || undefined}
        onClick={() => !pending && onCancel()}
      >
        {t('action.cancel')}
      </Button>
      <Button
        className="panel-wrap-button"
        leftSection={
          pending ? <Loader size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />
        }
        aria-disabled={blocked || undefined}
        aria-busy={pending || undefined}
        onClick={() => !blocked && onSave()}
      >
        {t('panel.saveChanges')}
      </Button>
    </Group>
  )
}

/** One-line glances for the tiles: enough to read at the table without opening anything. */
function useGlance(props: PanelProps, exhaustion: number | undefined): Record<TileKey, ReactNode> {
  const { t } = useTranslation()
  const trackerLabel = useTrackerLabel()
  const { build, level, vitals } = props
  const meter = (key: string, label: string, left: number, max: number) => (
    <span key={key} className="glance-meter">
      <span className="glance-meter-label user-copy">{label}</span>
      <span className="glance-meter-bar" aria-hidden="true">
        <span style={{ width: `${(left / Math.max(1, max)) * 100}%` }} />
      </span>
      <span className="glance-meter-value">
        {left}/{max}
      </span>
    </span>
  )
  const slots = slotsFor(build.casterKind, level)
  const slotMax = slots.reduce((sum, count) => sum + count, 0)
  const slotLeft = slots.reduce(
    (sum, count, index) => sum + Math.max(0, count - (vitals.slots_used[index] ?? 0)),
    0,
  )
  const resourceLines = [
    // Once-per-turn marks stay inside the sheet; the glance shows pools.
    ...build.trackers
      .filter((tracker) => !tracker.per)
      .slice(0, 4)
      .map((tracker) => {
        const used = Math.min(tracker.max, vitals.tracker_uses[tracker.id] ?? 0)
        return meter(tracker.id, trackerLabel(tracker), tracker.max - used, tracker.max)
      }),
    ...(slotMax > 0 ? [meter('slots', t('sheet.slots'), slotLeft, slotMax)] : []),
    meter('dice', t('sheet.hitDice'), level - Math.min(level, vitals.hit_dice_spent), level),
  ]
  const skills = skillKeys
    .filter((skill) => build.skills[skill])
    .map((skill) => ({ skill, bonus: skillBonus(build, level, skill) }))
    .sort((a, b) => b.bonus - a.bonus)
  const topSkills = skills
    .slice(0, 2)
    .map(({ skill, bonus }) => `${t(`srd.skill.${skill}`)} ${signed(bonus)}`)
    .join(', ')
  const casting = spellcasting(build, level)
  const firstNotes = build.notes.split('\n').find((line) => line.trim())
  const weaponAttacks = props.attacks.filter((line) => !line.unarmed)
  const attackSummary = (weaponAttacks.length ? weaponAttacks : props.attacks.slice(0, 1))
    .slice(0, 2)
    .map((line) => `${line.name} ${signed(line.attack)}`)
    .join(', ')
  return {
    resources: <span className="glance-meters">{resourceLines}</span>,
    skills:
      skills.length === 0
        ? t('panel.noSkills')
        : skills.length > 2
          ? t('panel.glance.skillsMore', { list: topSkills, count: skills.length - 2 })
          : topSkills,
    attacks: attackSummary || t('panel.glance.attacks'),
    features:
      build.features.length === 0
        ? t('sheet.noFeatures')
        : t('panel.glance.features', { count: build.features.length }),
    conditions:
      vitals.conditions.length > 0
        ? vitals.conditions.map((key) => t(`srd.condition.${key}`)).join(', ')
        : exhaustion
          ? t('sheet.exhaustion', { value: exhaustion })
          : vitals.current_hp === 0
            ? t(`sheet.deathState.${deathState(vitals)}`, {
                successes: vitals.death_successes,
                failures: vitals.death_failures,
              })
            : t('sheet.noConditions'),
    spells: casting
      ? t('panel.glance.spells', {
          dc: casting.saveDc,
          attack: signed(casting.attack),
          count: build.spells.length,
        })
      : t('panel.glance.spellsOnly', { count: build.spells.length }),
    notes: firstNotes ? (
      <span className="user-copy">{firstNotes.slice(0, 80)}</span>
    ) : (
      t('panel.glance.noNotes')
    ),
    history: t('panel.glance.history'),
  }
}
