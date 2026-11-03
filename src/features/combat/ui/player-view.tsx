import { useEffect, useState } from 'react'
import {
  Badge,
  Button,
  Drawer,
  Group,
  Paper,
  Stack,
  Text,
  Title,
  VisuallyHidden,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, Dice5, Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useAuth } from '@/features/auth'
import { initiativeBonus, sheetQuery } from '@/features/characters'
import { nextUp, turnsUntil, type CombatState, type Combatant } from '../domain/combat'
import { InitiativeDialog } from './amount-dialog'
import { CombatLog, CombatSummary } from './combat-log'
import { CombatantDetail } from './combatant-detail'
import { InitiativeRail } from './initiative-rail'
import { onlyTopDialog, useRunner } from './helpers'
import { NetworkState, RunnerError } from './parts'

/** Player screen: whose turn it is, the own character's controls and the shared order. */
export function PlayerView({
  campaignId,
  state,
  stale,
  connected,
  retry,
  backLink,
}: {
  campaignId: string
  state: CombatState
  stale: boolean
  connected: boolean
  retry: () => void
  backLink: boolean
}) {
  const { t } = useTranslation()
  const { state: auth } = useAuth()
  const wide = useMediaQuery('(min-width: 62em)')
  const encounter = state.encounter!
  const combatants = state.combatants
  const own = combatants.find((c) => c.is_own) ?? null
  const active = combatants.find((c) => c.is_active) ?? null
  const upNext = nextUp(combatants)
  const { run, pending, error, trigger, clear } = useRunner(campaignId)
  const sheet = useQuery({
    ...sheetQuery(auth.user!.id, campaignId, own?.character_id ?? 'none'),
    enabled: Boolean(own?.character_id),
  })
  const build = sheet.data?.sheet.build
  const bonus = build ? initiativeBonus(build) : null
  const needsInitiative =
    own !== null && own.initiative === undefined && encounter.status !== 'ended'
  const [initiativeOpen, setInitiativeOpen] = useState(false)
  // Ask once per encounter, automatically, when the DM requests initiative (render-phase update).
  const [askedFor, setAskedFor] = useState<string | null>(null)
  if (needsInitiative && encounter.status === 'initiative' && askedFor !== encounter.id) {
    setAskedFor(encounter.id)
    setInitiativeOpen(true)
  }
  const [viewing, setViewing] = useState<Combatant | null>(null)
  const viewed = viewing ? (combatants.find((c) => c.id === viewing.id) ?? null) : null
  const announcement = useTurnAnnouncement(state, own)
  const live = encounter.status === 'initiative' || encounter.status === 'active'
  const until = own ? turnsUntil(combatants, own.id) : null
  const yours = own?.is_active === true && encounter.status === 'active'
  const ownPanel = own && (
    <Paper className="combat-panel combat-own" p="md">
      <CombatantDetail
        encounterId={encounter.id}
        status={encounter.status}
        combatant={own}
        combatants={combatants}
        effects={state.effects}
        dm={false}
        activeId={encounter.active_combatant ?? null}
        run={run}
        pending={pending}
        onInitiative={live ? () => setInitiativeOpen(true) : undefined}
      />
    </Paper>
  )
  const order = (
    <section aria-labelledby="player-order-title">
      <Title order={2} id="player-order-title" className="combat-section-title">
        {t('combat.order.title')}
      </Title>
      <InitiativeRail
        combatants={combatants}
        mode={{ kind: 'pick', selectedId: viewing?.id ?? null, onPick: setViewing }}
      />
    </section>
  )
  return (
    <Stack gap="md" className={`combat-player${yours ? ' is-your-turn' : ''}`}>
      <VisuallyHidden aria-live="assertive">{announcement}</VisuallyHidden>
      <header className="combat-header">
        {backLink && !live && (
          <Button
            component={Link}
            to=".."
            relative="path"
            variant="subtle"
            size="sm"
            leftSection={<ArrowLeft size={16} aria-hidden="true" />}
            className="combat-back"
          >
            {t('combat.list.history')}
          </Button>
        )}
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Title order={1} className="combat-title">
              {encounter.name}
            </Title>
            <Group gap={8} mt={4}>
              <Badge variant={encounter.status === 'active' ? 'filled' : 'light'}>
                {t(`combat.status.${encounter.status}`)}
              </Badge>
              {encounter.status === 'active' && (
                <Text fw={700} className="combat-round">
                  {t('combat.round', { round: encounter.round })}
                </Text>
              )}
              {live && <NetworkState stale={stale} connected={connected} retry={retry} />}
            </Group>
          </div>
          {live && (
            <Button
              component={Link}
              to={backLink ? 'table' : `${encounter.id}/table`}
              variant="default"
              leftSection={<Monitor size={16} aria-hidden="true" />}
              visibleFrom="sm"
            >
              {t('combat.tableView')}
            </Button>
          )}
        </Group>
      </header>
      <RunnerError error={error} trigger={trigger} onClose={clear} />

      {needsInitiative && live && (
        <Paper className="combat-prompt" p="md" role="status">
          <Group justify="space-between" gap="sm">
            <Text fw={700}>{t('combat.initiative.prompt')}</Text>
            <Button
              size="md"
              leftSection={<Dice5 size={18} aria-hidden="true" />}
              onClick={() => setInitiativeOpen(true)}
            >
              {t('combat.initiative.enter')}
            </Button>
          </Group>
        </Paper>
      )}

      {encounter.status === 'active' && (
        <Paper className={`combat-hero${yours ? ' is-yours' : ''}`} p="md">
          {yours ? (
            <Group justify="space-between" gap="sm">
              <div>
                <Text className="combat-hero-title">{t('combat.turn.yours')}</Text>
                {upNext && (
                  <Text size="sm">
                    {t('combat.turn.upNext')}: {upNext.name}
                  </Text>
                )}
              </div>
              <Button
                size="lg"
                rightSection={<ChevronRight size={20} aria-hidden="true" />}
                disabled={pending || stale}
                onClick={() =>
                  void run({
                    kind: 'turn',
                    encounterId: encounter.id,
                    direction: 1,
                    expected: encounter.active_combatant ?? null,
                  })
                }
              >
                {t('combat.turn.endMine')}
              </Button>
            </Group>
          ) : (
            <div className="combat-hero-grid">
              <div>
                <Text size="sm" c="dimmed">
                  {t('combat.turn.now')}
                </Text>
                <Text className="combat-hero-title">{active?.name ?? '—'}</Text>
              </div>
              <div>
                <Text size="sm" c="dimmed">
                  {t('combat.turn.upNext')}
                </Text>
                <Text fw={700}>{upNext?.name ?? '—'}</Text>
              </div>
              <Text fw={600} className="combat-hero-until">
                {own === null
                  ? t('combat.turn.notInOrder')
                  : until !== null
                    ? t('combat.turn.in', { count: until })
                    : t('combat.initiative.missing')}
              </Text>
            </div>
          )}
        </Paper>
      )}

      {encounter.status === 'ended' && <CombatSummary encounter={encounter} />}

      {wide ? (
        <div className="combat-columns is-player">
          <div>{ownPanel}</div>
          <div className="combat-side">
            {order}
            <CombatLog events={state.events} run={run} pending={pending} canUndo={live} />
          </div>
        </div>
      ) : (
        <>
          {ownPanel}
          {order}
          <CombatLog events={state.events} run={run} pending={pending} canUndo={live} />
        </>
      )}

      <Drawer
        opened={viewed !== null}
        onClose={onlyTopDialog(() => {
          const id = viewing?.id
          setViewing(null)
          requestAnimationFrame(() => document.getElementById(`combatant-${id}`)?.focus())
        })}
        position={wide ? 'right' : 'bottom'}
        size={wide ? 'md' : '75%'}
        title={viewed?.name}
        closeButtonProps={{ 'aria-label': t('combat.detail.close'), size: 44 }}
        className="combat-drawer"
      >
        {viewed && (
          <CombatantDetail
            key={viewed.id}
            encounterId={encounter.id}
            status={encounter.status}
            combatant={viewed}
            combatants={combatants}
            effects={state.effects}
            dm={false}
            activeId={encounter.active_combatant ?? null}
            run={run}
            pending={pending}
          />
        )}
      </Drawer>

      {initiativeOpen && own && (
        <InitiativeDialog
          name={own.name}
          initial={own.initiative}
          bonus={bonus}
          dm={false}
          pending={pending}
          close={() => setInitiativeOpen(false)}
          save={async (total) => {
            if (await run({ kind: 'initiative', combatantId: own.id, total, bonus }))
              setInitiativeOpen(false)
          }}
        />
      )}
    </Stack>
  )
}

/** Announces turn changes to assistive tech and buzzes the device on the Player's own turn. */
function useTurnAnnouncement(state: CombatState, own: Combatant | null) {
  const { t } = useTranslation()
  const encounter = state.encounter
  const activeId = encounter?.status === 'active' ? (encounter.active_combatant ?? null) : null
  const [seen, setSeen] = useState(activeId)
  const [message, setMessage] = useState({ text: '', yours: false, turn: 0 })
  if (seen !== activeId) {
    setSeen(activeId)
    const active = state.combatants.find((c) => c.id === activeId)
    // The first state after mounting is not a change; only later turns are announced.
    if (active && seen !== null && encounter) {
      const yours = own !== null && active.id === own.id
      setMessage((previous) => ({
        text: yours
          ? t('combat.turn.announceYours', { name: active.name, round: encounter.round })
          : t('combat.turn.announce', { name: active.name, round: encounter.round }),
        yours,
        turn: previous.turn + 1,
      }))
    }
  }
  useEffect(() => {
    if (message.yours && 'vibrate' in navigator) navigator.vibrate?.([120, 60, 120])
  }, [message])
  return message.text
}
