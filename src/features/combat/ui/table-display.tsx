import { Button, Group, Stack, Text, Title } from '@mantine/core'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { nextUp, type CombatState } from '../domain/combat'
import { InitiativeRail } from './initiative-rail'
import { NetworkState } from './parts'

/**
 * RYT-038 table projection: large, read-only and fed by the Player projection without own data
 * (as_table), so it never contains DM secrets even when the DM opens it.
 */
export function TableDisplay({
  state,
  stale,
  connected,
  retry,
}: {
  state: CombatState
  stale: boolean
  connected: boolean
  retry: () => void
}) {
  const { t } = useTranslation()
  const encounter = state.encounter!
  const active = state.combatants.find((c) => c.is_active) ?? null
  const upNext = nextUp(state.combatants)
  return (
    <Stack gap="lg" className="combat-table-view">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={1} className="combat-table-title">
            {encounter.name}
          </Title>
          <Group gap="sm" mt={4}>
            <Text fw={700} className="combat-table-round">
              {encounter.status === 'active'
                ? t('combat.round', { round: encounter.round })
                : t(`combat.status.${encounter.status}`)}
            </Text>
            <NetworkState stale={stale} connected={connected} retry={retry} />
          </Group>
        </div>
        <Button
          component={Link}
          to=".."
          relative="path"
          variant="default"
          leftSection={<X size={16} aria-hidden="true" />}
        >
          {t('combat.tableExit')}
        </Button>
      </Group>
      {encounter.status === 'active' && (
        <div className="combat-table-now" aria-live="polite">
          <div>
            <Text className="combat-table-label">{t('combat.turn.now')}</Text>
            <Text className="combat-table-active">{active?.name ?? '—'}</Text>
          </div>
          <div>
            <Text className="combat-table-label">{t('combat.turn.upNext')}</Text>
            <Text className="combat-table-next">{upNext?.name ?? '—'}</Text>
          </div>
        </div>
      )}
      <InitiativeRail combatants={state.combatants} mode={{ kind: 'read' }} large />
    </Stack>
  )
}
