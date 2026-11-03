import { useEffect, useRef, useState, type FocusEvent } from 'react'
import {
  Badge,
  Button,
  Drawer,
  Group,
  Menu,
  Modal,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
  ActionIcon,
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core'
import { useMediaQuery, useReducedMotion } from '@mantine/hooks'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Dice5,
  Ellipsis,
  Flag,
  Heart,
  ListChecks,
  Monitor,
  Pencil,
  Play,
  Swords,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import {
  missingInitiative,
  nextUp,
  type CombatState,
  type Combatant,
  type HpMode,
} from '../domain/combat'
import { AddCombatants } from './add-combatants'
import { AmountDialog, InitiativeDialog } from './amount-dialog'
import { CombatLog, CombatSummary } from './combat-log'
import { CombatantDetail } from './combatant-detail'
import { InitiativeRail } from './initiative-rail'
import { onlyTopDialog, useRunner } from './helpers'
import { NetworkState, RunnerError } from './parts'
import { RemoveCombatantDialog, RowActions } from './roster'

type Panel = 'detail' | 'log' | 'add'

export function DmConsole({
  campaignId,
  state,
  stale,
  connected,
  retry,
}: {
  campaignId: string
  state: CombatState
  stale: boolean
  connected: boolean
  retry: () => void
}) {
  const { t } = useTranslation()
  const wide = useMediaQuery('(min-width: 62em)')
  const navigate = useNavigate()
  const encounter = state.encounter!
  const reduceMotion = useReducedMotion()
  const { run, pending, error, trigger, clear } = useRunner(campaignId)
  const activeId = encounter.active_combatant ?? null
  // The detail follows the turn: a row the DM picks stays shown only during the turn it was
  // picked in, so starting the fight and every turn change show whoever acts.
  const [picked, setPicked] = useState<{ id: string; turn: string | null } | null>(null)
  const selectedId =
    picked && picked.turn === activeId ? picked.id : (activeId ?? picked?.id ?? null)
  // Focus (also inside the detail's dialogs, which bubble through portals) means the DM is using
  // the detail: a turn change then keeps it on the same combatant instead of swapping it away.
  const [detailBusy, setDetailBusy] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [seenActive, setSeenActive] = useState(activeId)
  if (seenActive !== activeId) {
    setSeenActive(activeId)
    const shown =
      picked && picked.turn === seenActive ? picked.id : (seenActive ?? picked?.id ?? null)
    if (detailBusy && shown) setPicked({ id: shown, turn: activeId })
    const name = state.combatants.find((c) => c.id === activeId)?.name
    // Screen readers hear the turn change; keyboard focus stays on the control the DM used.
    if (name) setAnnouncement(t('combat.turn.announce', { name, round: encounter.round }))
  }
  const followsTurn = activeId !== null && selectedId === activeId
  // Turn buttons stay focusable while a turn change is saving (a disabled button drops focus).
  const atFirstTurn =
    encounter.round <= 1 && state.combatants.find((c) => c.in_turn_order)?.is_active === true
  const prevBlocked = pending || atFirstTurn
  // Phones show the detail in a sheet that opens only when the DM asks for it.
  const [sheetOpen, setSheetOpen] = useState(false)
  const [removing, setRemoving] = useState<Combatant | null>(null)
  // Dialogs opened from a menu item lose their opener when the menu closes: they hand focus back
  // to the menu's button instead. The sheet returns focus to whatever opened it.
  const returnTo = useRef<string | null>(null)
  const [sheetOpener, setSheetOpener] = useState<string | null>(null)
  const restoreFocus = () => {
    const id = returnTo.current
    returnTo.current = null
    if (id)
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-return-focus="${id}"]`)?.focus(),
      )
  }
  const fromMenu = (id: string, open: () => void) => {
    returnTo.current = id
    open()
  }
  const [multi, setMulti] = useState<ReadonlySet<string> | null>(null)
  const [multiMode, setMultiMode] = useState<HpMode | null>(null)
  const [initiativeFor, setInitiativeFor] = useState<Combatant | null>(null)
  const [panel, setPanel] = useState<Panel>(encounter.status === 'draft' ? 'add' : 'detail')
  // Leaving preparation hands the side panel to the fight (render-phase adjustment).
  const [seenStatus, setSeenStatus] = useState(encounter.status)
  if (seenStatus !== encounter.status) {
    setSeenStatus(encounter.status)
    if (seenStatus === 'draft' || encounter.status === 'ended') setPanel('detail')
  }
  const [confirm, setConfirm] = useState<'end' | 'delete' | 'rename' | null>(null)
  const [rename, setRename] = useState(encounter.name)
  const combatants = state.combatants
  const active = combatants.find((c) => c.is_active) ?? null
  // A removed selection falls back to whoever is acting.
  const selected = combatants.find((c) => c.id === selectedId) ?? (wide ? active : null)
  const upNext = nextUp(combatants)
  const missing = missingInitiative(combatants)
  const status = encounter.status
  // Keep the acting row in view when the turn moves (without moving keyboard focus).
  useEffect(() => {
    if (!activeId || !followsTurn) return
    document
      .getElementById(`combatant-${activeId}`)
      ?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [activeId, followsTurn, reduceMotion])
  // While collecting initiative, a row without a total opens the initiative keypad directly.
  const pick = (combatant: Combatant) => {
    if (status === 'initiative' && combatant.initiative === undefined) {
      setInitiativeFor(combatant)
      return
    }
    setPicked({ id: combatant.id, turn: activeId })
    if (wide) setPanel('detail')
    else {
      setSheetOpener(`combatant-${combatant.id}`)
      setSheetOpen(true)
    }
  }
  const showActive = () => {
    if (!active) return
    setPicked(null)
    if (wide) setPanel('detail')
    else {
      setSheetOpener('combat-turn-now')
      setSheetOpen(true)
    }
  }
  // Closing the sheet hands focus back to what opened it (a row or the turn bar).
  const closeSheet = onlyTopDialog(() => {
    const id = sheetOpener ?? `combatant-${selectedId}`
    setSheetOpen(false)
    requestAnimationFrame(() => document.getElementById(id)?.focus())
  })
  const removeNow = async () => {
    if (!removing) return
    const index = combatants.findIndex((c) => c.id === removing.id)
    const neighbour = combatants[index + 1] ?? combatants[index - 1] ?? null
    if (await run({ kind: 'remove', combatantId: removing.id })) {
      returnTo.current = null
      setRemoving(null)
      if (selectedId === removing.id) setSheetOpen(false)
      // The row is gone: focus lands on its neighbour in the order (or on the list title).
      requestAnimationFrame(() => {
        const row = neighbour && document.getElementById(`combatant-${neighbour.id}`)
        ;(row ?? document.getElementById('combat-order-title'))?.focus()
      })
    }
  }
  const detailFocus = {
    onFocus: () => setDetailBusy(true),
    onBlur: (event: FocusEvent<HTMLDivElement>) => {
      const next = event.relatedTarget
      if (!(next instanceof Node && event.currentTarget.contains(next))) setDetailBusy(false)
    },
  }
  const detail = selected && (
    <CombatantDetail
      key={selected.id}
      encounterId={encounter.id}
      status={status}
      combatant={selected}
      combatants={combatants}
      effects={state.effects}
      dm
      activeId={activeId}
      run={run}
      pending={pending}
      onInitiative={status !== 'ended' ? () => setInitiativeFor(selected) : undefined}
      onRemove={
        status !== 'ended'
          ? () => fromMenu(`detail-menu-${selected.id}`, () => setRemoving(selected))
          : undefined
      }
    />
  )
  const rail = (
    <section className="combat-rail-section" aria-labelledby="combat-order-title">
      <Group justify="space-between" mb="xs">
        <Title order={2} id="combat-order-title" className="combat-section-title" tabIndex={-1}>
          {t('combat.order.title')}
        </Title>
        {status === 'active' || status === 'initiative' ? (
          <Button
            size="sm"
            variant={multi ? 'filled' : 'default'}
            leftSection={<ListChecks size={16} aria-hidden="true" />}
            onClick={() => setMulti(multi ? null : new Set())}
            aria-pressed={multi !== null}
          >
            {t(multi ? 'combat.select.done' : 'combat.select.mode')}
          </Button>
        ) : null}
      </Group>
      <InitiativeRail
        combatants={combatants}
        mode={
          multi
            ? {
                kind: 'multi',
                selected: multi,
                onToggle: (c) => {
                  const next = new Set(multi)
                  if (next.has(c.id)) next.delete(c.id)
                  else next.add(c.id)
                  setMulti(next)
                },
              }
            : { kind: 'pick', selectedId: selected?.id ?? null, onPick: pick }
        }
        rowMenu={
          status !== 'ended'
            ? (combatant, control) => (
                <RowActions
                  combatant={combatant}
                  {...control}
                  onJump={
                    status === 'active' &&
                    !combatant.is_active &&
                    !combatant.hidden &&
                    !combatant.defeated
                      ? () =>
                          void run({
                            kind: 'jump',
                            encounterId: encounter.id,
                            target: combatant.id,
                            expected: activeId,
                          })
                      : undefined
                  }
                  onInitiative={() =>
                    fromMenu(`row-menu-${combatant.id}`, () => setInitiativeFor(combatant))
                  }
                  onRemove={() =>
                    fromMenu(`row-menu-${combatant.id}`, () => setRemoving(combatant))
                  }
                />
              )
            : undefined
        }
        reorder={
          status !== 'ended'
            ? (ids) => void run({ kind: 'order', encounterId: encounter.id, ids })
            : undefined
        }
      />
      {multi && multi.size > 0 && (
        <div className="combat-multi-bar" role="region" aria-label={t('combat.amount.targets')}>
          <Text size="sm" fw={600}>
            {t('combat.select.count', { count: multi.size })}
          </Text>
          <Group gap="xs">
            <Button
              variant="default"
              className="combat-btn-damage"
              leftSection={<Swords size={16} aria-hidden="true" />}
              onClick={() => setMultiMode('damage')}
            >
              {t('combat.select.damage')}
            </Button>
            <Button
              variant="default"
              className="combat-btn-heal"
              leftSection={<Heart size={16} aria-hidden="true" />}
              onClick={() => setMultiMode('heal')}
            >
              {t('combat.select.heal')}
            </Button>
            <Button variant="subtle" onClick={() => setMulti(new Set())}>
              {t('combat.select.clear')}
            </Button>
          </Group>
        </div>
      )}
    </section>
  )
  const side = (
    <Tabs
      value={!wide && panel === 'detail' ? 'log' : panel}
      onChange={(value) => setPanel((value as Panel) ?? 'detail')}
      variant="pills"
      keepMounted={false}
      className="dm-tabs combat-tabs"
    >
      <Tabs.List aria-label={t('combat.tabs')} className="dm-tabs-list">
        {wide && <Tabs.Tab value="detail">{t('combat.detail.title')}</Tabs.Tab>}
        <Tabs.Tab value="log">{t('combat.log.title')}</Tabs.Tab>
        {status !== 'ended' && <Tabs.Tab value="add">{t('combat.add.title')}</Tabs.Tab>}
      </Tabs.List>
      {wide && (
        <Tabs.Panel value="detail" pt="md">
          <div {...detailFocus}>{detail ?? <Text c="dimmed">{t('combat.detail.empty')}</Text>}</div>
        </Tabs.Panel>
      )}
      <Tabs.Panel value="log" pt="md">
        <CombatLog
          events={state.events}
          run={run}
          pending={pending}
          canUndo
          present={new Set(combatants.map((c) => c.id))}
        />
      </Tabs.Panel>
      {status !== 'ended' && (
        <Tabs.Panel value="add" pt="md">
          <AddCombatants
            campaignId={campaignId}
            encounterId={encounter.id}
            combatants={combatants}
            status={status}
            round={encounter.round}
            run={run}
            pending={pending}
          />
        </Tabs.Panel>
      )}
    </Tabs>
  )
  return (
    <Stack gap="md" className={`combat-console${status === 'active' ? ' has-turn-bar' : ''}`}>
      <VisuallyHidden aria-live="polite">{announcement}</VisuallyHidden>
      <header className="combat-header">
        <Button
          component={Link}
          to=".."
          relative="path"
          variant="subtle"
          size="sm"
          leftSection={<ArrowLeft size={16} aria-hidden="true" />}
          className="combat-back"
        >
          {t('combat.back')}
        </Button>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Title order={1} className="combat-title">
              {encounter.name}
            </Title>
            <Group gap={8} mt={4}>
              <Badge variant={status === 'active' ? 'filled' : 'light'}>
                {t(`combat.status.${status}`)}
              </Badge>
              {status === 'active' && (
                <Text fw={700} className="combat-round">
                  {t('combat.round', { round: encounter.round })}
                </Text>
              )}
              {status !== 'ended' && (
                <NetworkState stale={stale} connected={connected} retry={retry} />
              )}
            </Group>
          </div>
          <Group gap="xs" wrap="nowrap">
            {status !== 'draft' && (
              <Button
                component={Link}
                to="table"
                variant="default"
                leftSection={<Monitor size={16} aria-hidden="true" />}
                title={t('combat.tableViewHint')}
                visibleFrom="sm"
              >
                {t('combat.tableView')}
              </Button>
            )}
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="default" size={44} aria-label={t('combat.menu')}>
                  <Ellipsis size={18} aria-hidden="true" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {status !== 'draft' && (
                  <Menu.Item
                    component={Link}
                    to="table"
                    hiddenFrom="sm"
                    leftSection={<Monitor size={16} aria-hidden="true" />}
                  >
                    {t('combat.tableView')}
                  </Menu.Item>
                )}
                <Menu.Item
                  leftSection={<Pencil size={16} aria-hidden="true" />}
                  onClick={() => {
                    setRename(encounter.name)
                    setConfirm('rename')
                  }}
                >
                  {t('combat.rename')}
                </Menu.Item>
                {status === 'initiative' && (
                  <Menu.Item
                    leftSection={<Undo2 size={16} aria-hidden="true" />}
                    onClick={() =>
                      void run({ kind: 'status', encounterId: encounter.id, status: 'draft' })
                    }
                  >
                    {t('combat.flow.backToDraft')}
                  </Menu.Item>
                )}
                {(status === 'draft' || status === 'ended') && (
                  <Menu.Item
                    color="red"
                    leftSection={<Trash2 size={16} aria-hidden="true" />}
                    onClick={() => setConfirm('delete')}
                  >
                    {t('combat.delete')}
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </header>

      <RunnerError error={error} trigger={trigger} onClose={clear} />

      {status === 'draft' && (
        <div className="combat-flow">
          <Text size="sm">{t('combat.flow.draftHint')}</Text>
          <Group gap="xs">
            <Button
              leftSection={<Dice5 size={16} aria-hidden="true" />}
              disabled={pending || combatants.length === 0}
              onClick={() =>
                void run({ kind: 'status', encounterId: encounter.id, status: 'initiative' })
              }
            >
              {t('combat.flow.askInitiative')}
            </Button>
            <Button
              variant="default"
              leftSection={<Play size={16} aria-hidden="true" />}
              disabled={pending || combatants.length === 0}
              onClick={() =>
                void run({ kind: 'status', encounterId: encounter.id, status: 'active' })
              }
            >
              {t('combat.flow.startNow')}
            </Button>
          </Group>
        </div>
      )}
      {status === 'initiative' && (
        <div className="combat-flow">
          <Text size="sm">{t('combat.flow.initiativeHint')}</Text>
          <Text fw={700} role="status">
            {missing.length > 0
              ? t('combat.flow.missing', { count: missing.length })
              : t('combat.flow.ready')}
          </Text>
          <Group gap="xs">
            <Button
              variant="default"
              leftSection={<Dice5 size={16} aria-hidden="true" />}
              disabled={pending || !missing.some((c) => c.kind !== 'character')}
              onClick={() => void run({ kind: 'roll', encounterId: encounter.id })}
            >
              {t('combat.flow.rollNpcs')}
            </Button>
            <Button
              leftSection={<Play size={16} aria-hidden="true" />}
              disabled={pending}
              onClick={() =>
                void run({ kind: 'status', encounterId: encounter.id, status: 'active' })
              }
            >
              {t('combat.flow.start')}
            </Button>
          </Group>
        </div>
      )}
      {status === 'active' && (
        <Group justify="flex-end">
          <Button
            variant="default"
            color="red"
            leftSection={<Flag size={16} aria-hidden="true" />}
            onClick={() => setConfirm('end')}
          >
            {t('combat.flow.end')}
          </Button>
        </Group>
      )}
      {status === 'ended' && <CombatSummary encounter={encounter} />}

      {wide ? (
        <div className="combat-columns">
          {rail}
          <div className="combat-side">{side}</div>
        </div>
      ) : (
        <>
          {rail}
          {side}
          <Drawer
            opened={sheetOpen && selected !== null && !initiativeFor && !removing && multi === null}
            onClose={closeSheet}
            position="bottom"
            size="85%"
            title={selected?.name}
            closeButtonProps={{ 'aria-label': t('combat.detail.close'), size: 44 }}
            className="combat-drawer"
          >
            <div {...detailFocus}>{detail}</div>
          </Drawer>
        </>
      )}

      {status === 'active' && (
        <div className="combat-turn-bar" role="region" aria-label={t('combat.turn.bar')}>
          <ActionIcon
            variant="default"
            size={52}
            aria-label={t('combat.turn.prev')}
            data-disabled={prevBlocked || undefined}
            aria-disabled={prevBlocked || undefined}
            onClick={() => {
              if (!prevBlocked)
                void run({
                  kind: 'turn',
                  encounterId: encounter.id,
                  direction: -1,
                  expected: activeId,
                })
            }}
          >
            <ChevronLeft size={24} aria-hidden="true" />
          </ActionIcon>
          <UnstyledButton
            id="combat-turn-now"
            className="combat-turn-now"
            onClick={showActive}
            disabled={!active}
            // The visible lines plus the action, read as one sentence.
            aria-label={
              active
                ? [
                    `${t('combat.turn.now')} · ${t('combat.round', { round: encounter.round })}`,
                    active.name,
                    upNext ? `${t('combat.turn.upNext')}: ${upNext.name}` : null,
                  ]
                    .filter(Boolean)
                    .join(', ') + `. ${t('combat.turn.show')}`
                : undefined
            }
          >
            <Text size="xs" c="dimmed" component="span" display="block">
              {t('combat.turn.now')} · {t('combat.round', { round: encounter.round })}
            </Text>
            <Text fw={800} className="combat-turn-name" component="span" display="block">
              {active?.name ?? '—'}
            </Text>
            {upNext && (
              <Text size="xs" c="dimmed" component="span" display="block">
                {t('combat.turn.upNext')}: {upNext.name}
              </Text>
            )}
          </UnstyledButton>
          <Button
            size="lg"
            className="combat-turn-next"
            rightSection={<ChevronRight size={20} aria-hidden="true" />}
            data-disabled={pending || undefined}
            aria-disabled={pending || undefined}
            onClick={() => {
              if (!pending)
                void run({
                  kind: 'turn',
                  encounterId: encounter.id,
                  direction: 1,
                  expected: activeId,
                })
            }}
          >
            {t('combat.turn.next')}
          </Button>
        </div>
      )}

      {removing && (
        <RemoveCombatantDialog
          combatant={removing}
          next={removing.is_active ? nextUp(combatants) : null}
          pending={pending}
          close={() => {
            setRemoving(null)
            restoreFocus()
          }}
          confirm={() => void removeNow()}
        />
      )}
      {initiativeFor && (
        <InitiativeDialog
          name={initiativeFor.name}
          initial={initiativeFor.initiative}
          bonus={null}
          dm
          pending={pending}
          close={() => {
            setInitiativeFor(null)
            restoreFocus()
          }}
          save={async (total) => {
            if (
              await run({ kind: 'initiative', combatantId: initiativeFor.id, total, bonus: null })
            ) {
              setInitiativeFor(null)
              restoreFocus()
            }
          }}
        />
      )}
      {multi && multiMode && (
        <AmountDialog
          targets={combatants.filter((c) => multi.has(c.id))}
          initialMode={multiMode}
          pending={pending}
          close={() => setMultiMode(null)}
          apply={async (mode, hits) => {
            if (await run({ kind: 'hp', encounterId: encounter.id, mode, hits })) {
              setMultiMode(null)
              setMulti(new Set())
            }
          }}
        />
      )}
      <Modal
        opened={confirm === 'end'}
        onClose={() => setConfirm(null)}
        title={t('combat.flow.endTitle')}
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
      >
        <Text>{t('combat.flow.endBody')}</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={() => setConfirm(null)}>
            {t('action.cancel')}
          </Button>
          <Button
            color="red"
            loading={pending}
            onClick={async () => {
              if (await run({ kind: 'status', encounterId: encounter.id, status: 'ended' }))
                setConfirm(null)
            }}
          >
            {t('combat.flow.end')}
          </Button>
        </Group>
      </Modal>
      <Modal
        opened={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title={t('combat.deleteTitle', { name: encounter.name })}
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
      >
        <Text>{t('combat.deleteBody')}</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={() => setConfirm(null)}>
            {t('action.cancel')}
          </Button>
          <Button
            color="red"
            loading={pending}
            onClick={async () => {
              if (await run({ kind: 'delete', encounterId: encounter.id }))
                void navigate('..', { relative: 'path' })
            }}
          >
            {t('combat.delete')}
          </Button>
        </Group>
      </Modal>
      <Modal
        opened={confirm === 'rename'}
        onClose={() => setConfirm(null)}
        title={t('combat.renameTitle')}
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (!rename.trim()) return
            if (await run({ kind: 'rename', encounterId: encounter.id, name: rename.trim() }))
              setConfirm(null)
          }}
        >
          <TextInput
            data-autofocus
            label={t('combat.name')}
            value={rename}
            maxLength={80}
            onChange={(event) => setRename(event.currentTarget.value)}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={() => setConfirm(null)}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" loading={pending} disabled={!rename.trim()}>
              {t('combat.rename')}
            </Button>
          </Group>
        </form>
      </Modal>
    </Stack>
  )
}
